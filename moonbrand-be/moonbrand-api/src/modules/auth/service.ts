import type pg from 'pg';

import type { Account, Me, SignInRequest, SignUpRequest } from '@moonbrand/shared/api/contract';

import { withIdentity, type Identity } from '../../db/identity';
import { ApiError } from '../../errors';
import { createAccount, findAccount, recordSignIn } from './accounts';
import type { AuthGateway, Tokens } from './gateway';

export interface AuthResult extends Tokens {
  account: Account;
}

const publicAccount = ({ id, email, name }: Account): Account => ({ id, email, name });

export async function signUp(pool: pg.Pool, gateway: AuthGateway, input: SignUpRequest): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const created = await gateway.createUser(email, input.password);
  const session = await gateway.signIn(email, input.password);
  if (!session) {
    if (created) throw new Error('accesso non riuscito subito dopo la registrazione');
    throw ApiError.conflict('EMAIL_TAKEN', 'Questa email è già registrata: accedi con la sua password.');
  }
  await createAccount(pool, { id: session.userId, email, name: input.name.trim() });
  await recordSignIn(pool, session.userId);
  const account = await findAccount(pool, session.userId);
  if (!account) throw new Error('account non creato');
  const { userId: _userId, ...tokens } = session;
  return { ...tokens, account: publicAccount(account) };
}

export async function signIn(pool: pg.Pool, gateway: AuthGateway, input: SignInRequest): Promise<AuthResult> {
  const session = await gateway.signIn(input.email.trim().toLowerCase(), input.password);
  if (!session) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email o password non corretti.');
  const account = await findAccount(pool, session.userId);
  if (!account) throw ApiError.forbidden('NO_ACCOUNT', 'Questa email non ha ancora un account: registrati.');
  await recordSignIn(pool, session.userId);
  const { userId: _userId, ...tokens } = session;
  return { ...tokens, account: publicAccount(account) };
}

export async function me(pool: pg.Pool, identity: Identity): Promise<Me> {
  const account = await withIdentity(pool, identity, (db) => findAccount(db, identity.accountId));
  if (!account) throw ApiError.forbidden('NO_ACCOUNT', 'Questa email non ha ancora un account: registrati.');
  return { account: publicAccount(account), activeBrandId: account.activeBrandId };
}
