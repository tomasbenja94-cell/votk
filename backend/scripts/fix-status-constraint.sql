-- Fix transactions status constraint to include 'admitido'
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('pendiente','procesando','admitido','pagado','cancelado'));

