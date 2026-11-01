// Ejecutar: node --experimental-strip-types --test supabase/functions/_shared/avirato.test.ts
// Ejemplos con la estructura real de los avisos de Avirato (datos personales inventados).
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerAvisoAvirato } from "./avirato.ts";

// Gmail convierte el HTML de Avirato en tablas markdown como esta.
function cuerpo(cabecera: string, campos: [string, string][]) {
  const filas = campos.map(([k, v]) => `| |\n|---|\n| ${k} ${v} |\n|---|\n\n| |\n|---|\n| |\n|---|\n`).join("\n");
  return ` Ha recibido una nueva reserva desde el Channel Manager\n\n| |\n|---|\n| #### ${cabecera} |\n|---|\n\n| |\n|---|\n| Datos Reserva |\n|---|\n\n${filas}\n| ¿Necesita ayuda?[](https://ayuda.avirato.com/) | +34 902 750 460 |\n\nPor favor, no responda a este mensaje.`;
}

test("reserva nueva de Booking (Barco)", () => {
  const a = leerAvisoAvirato(
    "Nueva Reserva de Booking Id reserva:  6900000001",
    cuerpo("Ha recibido una nueva Reserva desde Booking", [
      ["Establecimiento", "El BOTONES"],
      ["Numéro de reserva", "6900000001"],
      ["Nombre del cliente", "Ana Prueba"],
      ["Tipo de Habitación", "1 x El Botones Barco"],
      ["Régimen", "SA"],
      ["Tarifa", "Tarifa No reembolsable"],
      ["Entrada", "2027-01-14"],
      ["Salida", "2027-01-17"],
      ["Observaciones", "Nº DE RESERVA DE BOOKING.COM: 6900000001 INFORMACIÓN ADICIONAL: Entrada por la calle principal ..."],
      ["Email Cliente", "ana.1@guest.booking.com"],
      ["Teléfono", ""],
      ["Adultos", "3"],
      ["Niños", "0"],
      ["Precio Total", "## 869.42 €"],
    ]),
  );
  assert.equal(a.tipo, "alta");
  assert.equal(a.portal, "Booking");
  assert.equal(a.codigo, "6900000001");
  assert.equal(a.cliente, "Ana Prueba");
  assert.equal(a.habitacion, "El Botones Barco");
  assert.equal(a.habitaciones, 1);
  assert.equal(a.entrada, "2027-01-14");
  assert.equal(a.salida, "2027-01-17");
  assert.equal(a.telefono, null);
  assert.equal(a.email, "ana.1@guest.booking.com");
  assert.equal(a.adultos, 3);
  assert.equal(a.ninos, 0);
  assert.equal(a.tarifa, "Tarifa No reembolsable");
  assert.equal(a.precio_total, 869.42);
  // "Entrada" dentro de las observaciones no debe confundir la lectura
  assert.match(a.observaciones ?? "", /calle principal/);
});

test("reserva nueva de Airbnb (Chueca), sin email", () => {
  const a = leerAvisoAvirato(
    "Nueva Reserva de Airbnb Id reserva:  HMAAAAAAAA",
    cuerpo("Ha recibido una nueva Reserva desde Airbnb", [
      ["Establecimiento", "El BOTONES"],
      ["Numéro de reserva", "HMAAAAAAAA"],
      ["Nombre del cliente", "Luis Ejemplo"],
      ["Tipo de Habitación", "1 x El Botones -Nuevo apto temporal en Plaza de Chueca"],
      ["Régimen", "SA"],
      ["Tarifa", "Tarifa Standard"],
      ["Entrada", "2026-11-24"],
      ["Salida", "2026-11-26"],
      ["Observaciones", "Nueva Reserva de Airbnb"],
      ["Email Cliente", ""],
      ["Teléfono", "4790000000"],
      ["Adultos", "5"],
      ["Niños", "0"],
      ["Precio Total", "## 697.9 €"],
    ]),
  );
  assert.equal(a.tipo, "alta");
  assert.equal(a.portal, "Airbnb");
  assert.equal(a.habitacion, "El Botones -Nuevo apto temporal en Plaza de Chueca");
  assert.equal(a.email, null);
  assert.equal(a.telefono, "4790000000");
  assert.equal(a.precio_total, 697.9);
});

test("modificación de Airbnb", () => {
  const a = leerAvisoAvirato(
    "Nueva Modificación de Airbnb Id reserva:  HMBBBBBBBB",
    cuerpo("Ha recibido una nueva Modificación desde Airbnb", [
      ["Establecimiento", "El BOTONES"],
      ["Numéro de reserva", "HMBBBBBBBB"],
      ["Nombre del cliente", "Eva Muestra"],
      ["Tipo de Habitación", "1 x El Botones -Nuevo apto temporal en Plaza de Chueca"],
      ["Régimen", "SA"],
      ["Tarifa", "Tarifa Standard"],
      ["Entrada", "2026-10-20"],
      ["Salida", "2026-10-23"],
      ["Observaciones", "Nueva Reserva de Airbnb Reserva modificada por Airbnb Nueva Reserva de Airbnb"],
      ["Email Cliente", ""],
      ["Teléfono", "13050000000"],
      ["Adultos", "6"],
      ["Niños", "0"],
      ["Precio Total", "## 1115.1 €"],
    ]),
  );
  assert.equal(a.tipo, "modificacion");
  assert.equal(a.codigo, "HMBBBBBBBB");
  assert.equal(a.precio_total, 1115.1);
});

test("cancelación de Booking: sin Precio Total ni Observaciones", () => {
  const a = leerAvisoAvirato(
    "Nueva cancelacion de Booking Id reserva:  5700000001",
    cuerpo("Ha recibido una nueva cancelacion desde Booking", [
      ["Establecimiento", "El BOTONES"],
      ["Numéro de reserva", "5700000001"],
      ["Nombre del cliente", "Pedro Demo"],
      ["Tipo de Habitación", "1 x El Botones Barco"],
      ["Régimen", "SA"],
      ["Tarifa", "Tarifa Standard"],
      ["Entrada", "2027-01-17"],
      ["Salida", "2027-01-22"],
      ["Email Cliente", "pedro.2@guest.booking.com"],
      ["Teléfono", ""],
      ["Adultos", "3"],
      ["Niños", "0"],
    ]),
  );
  assert.equal(a.tipo, "cancelacion");
  assert.equal(a.portal, "Booking");
  assert.equal(a.entrada, "2027-01-17");
  assert.equal(a.salida, "2027-01-22");
  assert.equal(a.observaciones, null);
  assert.equal(a.precio_total, null);
  assert.equal(a.adultos, 3);
});

test("cuerpo HTML con entidades y formato europeo de importe", () => {
  const html = `<html><head><style>td{color:red}</style></head><body>
    <h4>Ha recibido una nueva Reserva desde Booking</h4>
    <table><tr><td>Establecimiento</td><td>El BOTONES</td></tr>
    <tr><td>Num&eacute;ro de reserva</td><td>6900000002</td></tr>
    <tr><td>Nombre del cliente</td><td>Mar&iacute;a Ni&ntilde;o</td></tr>
    <tr><td>Tipo de Habitaci&oacute;n</td><td>1 x El Botones Barco</td></tr>
    <tr><td>R&eacute;gimen</td><td>SA</td></tr><tr><td>Tarifa</td><td>Tarifa Standard</td></tr>
    <tr><td>Entrada</td><td>2027-02-01</td></tr><tr><td>Salida</td><td>2027-02-04</td></tr>
    <tr><td>Email Cliente</td><td></td></tr><tr><td>Tel&eacute;fono</td><td>+34 600 000 000</td></tr>
    <tr><td>Adultos</td><td>2</td></tr><tr><td>Ni&ntilde;os</td><td>1</td></tr>
    <tr><td>Precio Total</td><td><h2>1.234,56 &euro;</h2></td></tr></table>
    <p>&iquest;Necesita ayuda?</p></body></html>`;
  const a = leerAvisoAvirato("Nueva Reserva de Booking Id reserva:  6900000002", html);
  assert.equal(a.tipo, "alta");
  assert.equal(a.cliente, "María Niño");
  assert.equal(a.telefono, "+34600000000");
  assert.equal(a.ninos, 1);
  assert.equal(a.precio_total, 1234.56);
});
