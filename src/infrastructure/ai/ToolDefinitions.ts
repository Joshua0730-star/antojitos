export const AI_TOOLS_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'calcular_domicilio',
      description: 'Calcula la tarifa determinista de domicilio usando el barrio confirmado por el cliente. La hora la obtiene el sistema; la lluvia es opcional y solo debe venir de una fuente interna, nunca preguntarse al cliente.',
      parameters: {
        type: 'object',
        properties: {
          barrio: { type: 'string' },
          llueve: { type: 'boolean', description: 'Dato interno opcional de clima; no pedirlo al cliente.' }
        },
        required: ['barrio']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'obtener_catalogo',
      description: 'Retorna la lista de productos disponibles, categorías, precios y opciones de personalización (tamaños, toppings, salsas, etc.) de Antojitos.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'validar_comprobante_nequi',
      description: 'Valida un comprobante de pago Nequi analizando la imagen vía OCR, comprobando el monto esperado, la fecha de hoy y verificando que el número de referencia no haya sido utilizado antes.',
      parameters: {
        type: 'object',
        properties: {
          image_url: {
            type: 'string',
            description: 'URL o identificador de la imagen del comprobante enviada por el usuario.'
          },
          monto_esperado: {
            type: 'number',
            description: 'Total en pesos colombianos (COP) que el cliente debe pagar por el pedido actual.'
          }
        },
        required: ['image_url', 'monto_esperado']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'notificar_cocina',
      description: 'Confirma el pedido y lo envía inmediatamente al canal de WhatsApp de cocina/preparación. El pago puede quedar pendiente: efectivo se confirma al entregar y Nequi se valida posteriormente desde el panel. Retorna el ID de la orden generada.',
      parameters: {
        type: 'object',
        properties: {
          resumen_pedido_formatted: {
            type: 'string',
            description: 'El mensaje completo formateado con emojis listo para enviar al grupo de cocina.'
          },
          detalles_json: {
            type: 'object',
            description: 'Estructura JSON con cliente, items, opciones y método de pago.',
            properties: {
              cliente: {
                type: 'object',
                properties: {
                  nombre: { type: 'string' },
                  telefono: { type: 'string', description: 'Teléfono del cliente. Se solicita únicamente al confirmar el pedido si no está disponible.' },
                  tipo_entrega: { type: 'string', enum: ['DOMICILIO', 'RECOGER_EN_LOCAL'] },
                  direccion: { type: 'string' },
                  barrio_municipio: { type: 'string' },
                  especificaciones: { type: 'string' }
                },
                required: ['nombre', 'tipo_entrega']
              },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id_producto: { type: 'string' },
                    nombre: { type: 'string' },
                    categoria: { type: 'string' },
                    precio_base: { type: 'number' },
                    cantidad: { type: 'number' },
                    tamano: {
                      type: 'object',
                      properties: {
                        nombre: { type: 'string' },
                        adicional: { type: 'number' }
                      }
                    },
                    toppings: {
                      type: 'array',
                      items: { type: 'string' }
                    },
                    salsa: { type: 'string' },
                    adiciones_extra: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          nombre: { type: 'string' },
                          adicional: { type: 'number' }
                        }
                      }
                    },
                    sabor_helado: { type: 'string' },
                    extra_queso: {
                      type: 'object',
                      properties: {
                        nombre: { type: 'string' },
                        adicional: { type: 'number' }
                      }
                    }
                  },
                  required: ['id_producto', 'nombre', 'precio_base', 'cantidad']
                }
              },
              metodo_pago: { type: 'string', enum: ['EFECTIVO', 'NEQUI'] },
              paga_con_billete: { type: 'number' },
              referencia_nequi: { type: 'string' },
              orden_id: { type: 'string' }
            },
            required: ['cliente', 'items', 'metodo_pago']
          }
        },
        required: ['resumen_pedido_formatted', 'detalles_json']
      }
    }
  }
];
