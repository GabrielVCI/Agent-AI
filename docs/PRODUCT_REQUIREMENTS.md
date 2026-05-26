# MVP Agente IA para Ferretería

## Objetivo

Crear un agente IA de ventas por WhatsApp para ferreterías, capaz de atender clientes, entender pedidos normales y técnicos, consultar productos, corregir errores comunes, generar cotizaciones y enviar PDFs.

## Propuesta de valor

El sistema funcionará como un vendedor digital que atiende clientes por WhatsApp, reduce tareas repetitivas, organiza solicitudes y ayuda a generar cotizaciones más rápido.

## Funciones principales

1. Recibir mensajes desde WhatsApp.
2. Identificar intención del cliente.
3. Entender productos aunque estén mal escritos.
4. Consultar precio y disponibilidad.
5. Recomendar productos.
6. Crear cotizaciones.
7. Calcular subtotal, ITBIS y total.
8. Generar PDF con plantilla de la empresa.
9. Enviar PDF al cliente.
10. Pasar conversación a humano cuando sea necesario.

## Casos principales

### Cliente común

Una persona pregunta por pintura semi gloss blanca, pide recomendaciones, marcas, precios, agrega rodillo y recibe cotización.

### Cliente técnico

Un herrero envía una lista de productos técnicos, algunos mal escritos. El agente debe interpretar, corregir, consultar disponibilidad, pedir confirmación si hay dudas y generar cotización.

## Reglas comerciales

- No inventar precios.
- No inventar stock.
- No confirmar productos ambiguos sin preguntar.
- No aplicar descuentos sin autorización.
- No prometer delivery si no está configurado.
- Pasar a humano si el pedido es ambiguo, de alto monto o requiere aprobación.