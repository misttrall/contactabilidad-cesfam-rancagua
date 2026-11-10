-- La bitácora de auditoría es append-only: ninguna sesión puede modificar ni borrar eventos,
-- ni siquiera el usuario de la aplicación (Ley 21.719, informe 13.3).
-- La purga por retención se hará con una función SECURITY DEFINER dedicada en S6, auditada aparte.

CREATE OR REPLACE FUNCTION audit_event_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event es append-only: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_sin_update_delete
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_inmutable();

-- TRUNCATE no dispara triggers de fila: se bloquea con un trigger de sentencia.
CREATE TRIGGER audit_event_sin_truncate
  BEFORE TRUNCATE ON "audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_event_inmutable();
