import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString) {
  return new Pool({ connectionString });
}

export function createTransactionRunner(pool, apiUserId) {
  return async function inApiTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = (await client.query('select email from auth.users where id = $1', [apiUserId])).rows[0];
      if (!user) throw new Error('ROUTEFOLK_API_USER_ID does not identify an Auth user');
      const claims = JSON.stringify({ sub: apiUserId, role: 'authenticated', email: user.email });
      await client.query(
        "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)",
        [apiUserId, claims],
      );
      // The connection uses postgres only to establish the claims above. All
      // application queries run as authenticated so PostgreSQL enforces RLS.
      await client.query('SET LOCAL ROLE authenticated');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}
