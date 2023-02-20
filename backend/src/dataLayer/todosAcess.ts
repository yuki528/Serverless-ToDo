import * as AWS from 'aws-sdk'
const AWSXRay = require('aws-xray-sdk') 
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { createLogger } from '../utils/logger'
import { TodoItem } from '../models/TodoItem'
import { TodoUpdate } from '../models/TodoUpdate';

const XAWS = AWSXRay.captureAWS(AWS)

const logger = createLogger('TodosAccess')

export class TodosAccess {
    constructor(
        private readonly docClient: DocumentClient = createDynamoDBClient(),
        private readonly todosTable = process.env.TODOS_TABLE,
        private readonly s3Bucket = process.env.ATTACHMENT_S3_BUCKET
    ) {}

    async createTodo(todo: TodoItem): Promise<TodoItem> {
        logger.info(`Creating todo new ${todo.todoId}`);

        let params = {
            TableName: this.todosTable,
            Item: todo
        }
        await this.docClient.put(params).promise()
        return todo;
    }

    async getTodosForUSer(userId: string): Promise<TodoItem[]> {
        logger.info(`Getting all todos for user ${userId}`);

        let params = {
            TableName: this.todosTable,
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: {
                ":userId": userId
            }
        }
        const result =  await this.docClient.query(params).promise();
        const items = result.Items
        return items as TodoItem[];
    }

    async updateTodo(userId: string, todoId: string, updatedTodo: TodoUpdate): Promise<TodoItem> {
        logger.info(`Updating todo ${todoId}`);

        let params = {
            TableName: this.todosTable,
            Key: {
                userId,
                todoId
            },
            UpdateExpression: "set #name = :name, #dueDate = :dueDate, #done = :done",
            ExpressionAttributeNames: {
                "#name": "name",
                "#dueDate": "dueDate",
                "#done": "done",
            },
            ExpressionAttributeValues: {
                ":name": updatedTodo.name,
                ":dueDate": updatedTodo.dueDate,
                ":done": updatedTodo.done,
            },
            ReturnValues: "ALL_NEW"
        }
        const result =  await this.docClient.update(params).promise();
        const item = result.Attributes;
        return item as TodoItem;
    }

    async updateAttachmentUrl(todoId: string, userId: string): Promise<TodoItem>{

        console.log('Updating attachment url')
    
        const attachmentUrl: string = `https://${this.s3Bucket}.s3.amazonaws.com/${todoId}`
    
        const params = {
            TableName: this.todosTable,
            Key: {
                "userId": userId,
                "todoId": todoId
            },
            UpdateExpression: "set #attachmentUrl = :attachmentUrl",
            ExpressionAttributeNames: {
                "#attachmentUrl": "attachmentUrl"
            },
            ExpressionAttributeValues: {
                ":attachmentUrl": attachmentUrl
            },
            ReturnValues: "ALL_NEW"
        }
    
        const result = await this.docClient.update(params).promise()
        const item = result.Attributes
        return item as TodoItem
    }

    async deleteTodo(userId: string, todoId: string): Promise<TodoItem> {
        logger.info(`Deleting todo ${todoId}`);

        let params = {
            TableName: this.todosTable,
            Key: {
                userId,
                todoId
            }
        }
        const result =  await this.docClient.delete(params).promise();
        const item = result.Attributes;
        return item as TodoItem;
    }
}

function createDynamoDBClient() {
    return new XAWS.DynamoDB.DocumentClient()
}