# Flujo de una reserva

```
aviso del canal ──► importe con comisión ──► ┬─ formulario de huéspedes (todos) ─┬──► check-in
                                              └─ contrato firmado (titular) ──────┘
                 cancelación posible en cualquier momento
```

Cada paso guarda cuándo se hizo en `reservas`; la columna calculada `fase` resume el estado:

| `fase` | Condición (en este orden) |
|---|---|
| `cancelada` | `estado = 'cancelada'` |
| `pendiente_importe` | `importe_pendiente` (falta el total con comisión) |
| `checkin_completado` | `checkin_at` informado |
| `pendiente_documentacion` | falta `formulario_completado_at` o `contrato_firmado_at` |
| `lista_checkin` | todo lo anterior hecho |

- **Formulario**: `num_huespedes` (adultos + niños del aviso del canal). `formulario_completado_at` se
  marca/desmarca solo (triggers) cuando el nº de huéspedes registrados llega a `num_huespedes`.
  Si el canal da un número erróneo, se corrige en el detalle de la reserva.
- **Contrato**: basta con la firma del titular (`contrato_firmado_at`). Se enviará con HelloSign (pendiente).
- **Check-in**: `checkin_at`, disponible desde el día de entrada y con el importe informado.
- Mientras el envío del formulario, la firma y el check-in no estén automatizados, contrato y check-in
  se marcan a mano desde los pasos de cada reserva en el listado de Entradas.

Histórico importado del Sheet: formulario completado (huéspedes ya registrados) y, si la entrada ya pasó,
check-in completado. Las reservas futuras del Sheet quedan pendientes del contrato.

## Formulario de huéspedes (`/f/<token>`)

- Un enlace secreto por reserva (`reservas.formulario_token`). Página pública, en español e inglés,
  pensada para móvil: 4 pasos por huésped (datos personales, documento, residencia, contacto),
  validación de DNI/NIE, buscador de municipios españoles, borrador guardado en el dispositivo y
  dirección/país/motivo reutilizados para el siguiente huésped. No se suben fotos de documentos.
- El público no accede a ninguna tabla: solo a `formulario_obtener`, `formulario_municipios` y
  `formulario_registrar`, que comprueban el token, el estado de la reserva y las plazas.
- Envío desde los pasos de la reserva en el listado de Entradas: WhatsApp (mensaje y enlace ya escritos), email (abre el
  correo con el texto) o copiar el enlace. Al usarlos se apunta `formulario_enviado_at`.
- Email directo: la Edge Function `enviar-formulario` (con la sesión del gestor) lo envía desde
  `hola@botonesmadrid.com` con la Gmail API (`gmail.send`); queda en *Enviados*. Si falla, el
  enlace «abrir en mi correo» abre el correo del gestor con el texto preparado.

## Pasos en el listado

Cada reserva muestra `Importe › Huéspedes x/N › Contrato › Check-in` (verde = hecho, ámbar = siguiente,
gris = después). Al pulsar se despliegan debajo las acciones: enviar formulario, nº de huéspedes,
marcar contrato, check-in, cancelar/reactivar. El detalle queda solo para consultar datos.
