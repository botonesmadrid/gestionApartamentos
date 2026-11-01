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
  se marcan a mano en el detalle de la reserva (Entradas → Detalle → Pasos).

Histórico importado del Sheet: formulario completado (huéspedes ya registrados) y, si la entrada ya pasó,
check-in completado. Las reservas futuras del Sheet quedan pendientes del contrato.
