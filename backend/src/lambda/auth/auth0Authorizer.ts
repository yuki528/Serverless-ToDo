import { CustomAuthorizerEvent, CustomAuthorizerResult } from 'aws-lambda'
import 'source-map-support/register'

import { verify, decode } from 'jsonwebtoken'
import { createLogger } from '../../utils/logger'
import Axios from 'axios'
import { Jwt } from '../../auth/Jwt'
import { JwtPayload } from '../../auth/JwtPayload'
import { Jwk } from '../../auth/Jwk'

const logger = createLogger('auth')

const jwksUrl = process.env.AUTH0_JWKS_URL;

let cachedCertificate: string; // Cache Certificate to Avoid always refetching

export const handler = async (
  event: CustomAuthorizerEvent
): Promise<CustomAuthorizerResult> => {
  logger.info('Authorizing a user', event.authorizationToken)
  try {
    const jwtToken = await verifyToken(event.authorizationToken)
    logger.info('User was authorized', jwtToken)

    return {
      principalId: jwtToken.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: '*'
          }
        ]
      }
    }
  } catch (e) {
    logger.error('User not authorized', { error: e.message })

    return {
      principalId: 'user',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Deny',
            Resource: '*'
          }
        ]
      }
    }
  }
}

async function verifyToken(authHeader: string): Promise<JwtPayload> {
  const token = getToken(authHeader)
  const jwt: Jwt = decode(token, { complete: true }) as Jwt

  const kid = jwt.header.kid; // Get the unique identifier for the key

  const cert = await getCertificate(kid); // Get verification certificate

  return verify(token, cert, { algorithms: ['RS256'] }) as JwtPayload
}

async function getCertificate(kid: string): Promise<string> {
  /**
   * Download Verification Certificate from Auth0 JWKS endpoint
   * or use Cached Valodation
   */
  if (cachedCertificate) return cachedCertificate;

  logger.info(`Fetching certificate from Auth0`);

  const response = await Axios.get(jwksUrl);
  const keys = response.data.keys;

  if (!keys || !keys.length)
    throw new Error('The JWKS endpoint did not contain any keys');

  const signingKeys = getSigningKeys(keys);

  if (!signingKeys.length)
    throw new Error('The JWKS endpoint did not contain any signature verification keys');
  
  const key = getSigningKey(signingKeys, kid);

  const pub = key.x5c[0]  // Get the public key
  cachedCertificate = certToPEM(pub)

  logger.info('Valid certificate was downloaded', cachedCertificate)

  return cachedCertificate
}

function getSigningKeys(keys: Jwk[]): Jwk[] {
  /**
   * Get all the Keys intended for verifying a JWT with the keytype of RSA
   */
  return keys.filter(
    key => key.use === 'sig'
           && key.kty === 'RSA'
           && key.alg === 'RS256'
           && key.n
           && key.e
           && key.kid
           && (key.x5c && key.x5c.length)
  )
}

function getSigningKey(keys: Jwk[], kid: string): Jwk {
  /**
   * Find the exact signature verification key
   */
  return keys.find(key => key.kid == kid);
}

function certToPEM(cert: string): string {
  /**
   * Convert Certificate to PEM
   */
  cert = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----\n`
  return cert
}

function getToken(authHeader: string): string {
  if (!authHeader) throw new Error('No authentication header')

  if (!authHeader.toLowerCase().startsWith('bearer '))
    throw new Error('Invalid authentication header')

  const split = authHeader.split(' ')
  const token = split[1]

  return token
}
