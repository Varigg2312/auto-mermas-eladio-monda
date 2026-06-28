'use strict';
const { z } = require('zod');

// Valida formato DD/MM/YYYY y que la fecha sea real (no 31/02/2026)
const fechaSchema = z
    .string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Formato de fecha inválido — usa DD/MM/YYYY')
    .refine(str => {
        const [d, m, y] = str.split('/').map(Number);
        const fecha = new Date(y, m - 1, d);
        return fecha.getFullYear() === y && fecha.getMonth() === m - 1 && fecha.getDate() === d;
    }, 'La fecha no existe en el calendario');

const entradaSchema = z.object({
    kilos_recibidos: z
        .number({ invalid_type_error: 'Kilos recibidos debe ser un número' })
        .positive('Kilos recibidos debe ser mayor que cero'),
    albaran: z.string().default(''),
});

const salidaGazpachoSchema = z.object({
    litros: z
        .number({ invalid_type_error: 'Litros expedidos debe ser un número' })
        .positive('Litros expedidos debe ser mayor que cero'),
    albaran: z.string().default(''),
    porcentaje_merma: z.number().min(0).max(100).optional(),
});

const salidaSalmorejoSchema = z.object({
    kilos: z
        .number({ invalid_type_error: 'Kilos de salmorejo debe ser un número' })
        .positive('Kilos de salmorejo debe ser mayor que cero'),
    albaran: z.string().default(''),
    porcentaje_merma: z.number().min(0).max(100).optional(),
});

// Schema principal del parte diario
const diarioSchema = z
    .object({
        fecha:     fechaSchema,
        operador:  z.string().min(1, 'El campo Operador no puede estar vacío'),
        entrada:   entradaSchema.optional(),
        gazpacho:  salidaGazpachoSchema.optional(),
        salmorejo: salidaSalmorejoSchema.optional(),
    })
    .refine(
        d => d.entrada || d.gazpacho || d.salmorejo,
        { message: 'El parte debe tener al menos una operación (entrada de tomate, gazpacho o salmorejo)' }
    );

module.exports = { diarioSchema };
