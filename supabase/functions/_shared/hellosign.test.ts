// node --experimental-strip-types --test supabase/functions/_shared/hellosign.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerFirmaHelloSign } from "./hellosign.ts";

test("correo de firma en español (texto)", () => {
  const f = leerFirmaHelloSign(
    "Ana Prueba firmó El  Botones Barco Ana",
    "¡Listo! Firmaron tu documento\n\nDocumento:\nEl Botones Barco Ana\n\nFirmado:\nAna Prueba (ana.prueba@example.com)\n\nPuedes ver el documento…",
  );
  assert.deepEqual(f, { firmante: "Ana Prueba", email: "ana.prueba@example.com", titulo: "El Botones Barco Ana" });
});

test("título con varias palabras y cliente Casa Malasaña", () => {
  const f = leerFirmaHelloSign(
    "Per de Mare firmó Casa Malasaña Madrid Per de Mare",
    "<p>Documento</p><p>Casa Malasaña Madrid Per de Mare</p><p>Firmante</p><p>Per de Mare (per@example.org)</p>",
  );
  assert.equal(f.firmante, "Per de Mare");
  assert.equal(f.email, "per@example.org");
  assert.equal(f.titulo, "Casa Malasaña Madrid Per de Mare");
});
