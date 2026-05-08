# REPORTE DE AUDITORÍA FORENSE: PROTOCOLO VS. REALIDAD

Este documento ha sido generado para que el modelo Gemma 4 analice su propia desviación del protocolo establecido.

---

## 1. EL PROTOCOLO (Instrucciones enviadas a la IA)

```markdown
[ROLE]: EXPERT FORENSIC GARMENT ANALYST.
[TASK]: PIXEL-LEVEL TECHNICAL DATA EXTRACTION.
[OUTPUT_LANGUAGE]: SPANISH.
[STRICT_CONSTRAINT]: NO CONVERSATION. NO REASONING. NO SELF-CORRECTION. NO INTRODUCTION. NO MARKDOWN. 
[OUTPUT_FORMAT]: RAW TEXT (FIELD_NAME: VALUE).

[CORE_PROTOCOL]:
TIPO_PRENDA: [Ej: Remera, Pantalón, Campera]
POSICIÓN_DETECTADA: [FRENTE / ESPALDA / LATERAL / PLANO / GHOST_MANNEQUIN / PILA_O_DOBLADO / INDETERMINADO]
SOPORTE_O_CONTEXTO: [FOTO_ESTUDIO / COLGADA_EN_PERCHA / DOBLADA_EN_SUPERFICIE / SOBRE_MANIQUÍ / EN_PERCHERO_MULTIPLE]
COLOR_PRINCIPAL:
  - Nombre técnico: [Nombre del color]
  - Código HEX: [#XXXXXX]
  - Tipo: [LISO / ESTAMPADO / SUBLIMADO / RAYADO / JASPEADO]
  - Patrón: [Descripción breve si es estampado]
MATERIAL_ESTIMADO: [Ej: Jersey de algodón, Trama Dri-FIT]
LOGO_O_MARCA:
  - Visible: [SÍ / NO]
  - Descripción: [Si SÍ, posición y tamaño. Si NO, dejar vacío]
DETALLES_CONSTRUCTIVOS:
  - Costuras: [Ej: Flatlock, Overlock]
  - Cierres: [Ej: Cierre YKK, Botones]
  - Bolsillos: [Ej: 2 laterales]
  - Elásticos: [Ej: Cintura elástica]
AVISOS_DE_LIMPIEZA_VISIBLES: [SÍ / NO]
ESTADO_VISUAL: [LIMPIO / CON ETIQUETAS / CON MANIQUÍ]

[NEGATIVE_CONSTRAINTS]:
- DO NOT mention "Self-correction".
- DO NOT mention "I see...".
- DO NOT use bolding (**) or markdown headers.
- DO NOT explain your reasoning.
- START directly with "TIPO_PRENDA".
```

---

## 2. EL RESULTADO REAL (Ruido generado por la IA)

El modelo entregó el siguiente texto, ignorando las restricciones negativas y el formato crudo:

```text
TIPO:* It's a pair of boxer briefs. In Spanish: Boxer. * *
POSICIÓN:* It's shown from the front, floating (ghost mannequin style). In Spanish: FRENTE / GHOST_MANNEQUIN. * *SOPORTE_O_CONTEXTO:* It's a studio shot on a white background, appearing as if worn but without a visible mannequin. In Spanish: FOTO_ESTUDIO. * *
COLOR/ESTILO:* * Main body: Dark navy blue. * Waistband: Light blue. * HEX (approximate): Navy #1B263B, Light Blue #7FB3D5. * Tipo: ESTAMPADO. * Pattern: Characters (Goku from Dragon Ball) riding clouds, with "Dragon Ball Z" text scattered. * *
MATERIAL:* Looks like a jersey knit (cotton/polyester blend as per reference, but visually it's a soft knit). In Spanish: Punto de algodón y poliéster. * *
MARCA/LOGO:* * Visible: SÍ. * Description: "UOMO" (partially visible as "OMO") and "UnderWear" on the waistband. * Position: Cintura elástica. * Size: Large text on the waistband. * *
DETALLES:* * Costuras: Overlock/flat seams visible at the leg openings and center pouch. * Cierres: Sin cierre. * Bolsillos: Sin bolsillos. * Elásticos: Cintura elástica ancha. * *AVISOS_DE_LIMPIEZA_VISIBLES:* NO. * *
ESTADO:* LIMPIO y PRESENTABLE.

*Self-Correction during drafting:* The reference says Brand is "UOMO", but the photo shows "OMO" (likely cut off or part of the design). I will report what is visible in the pixels as per the "Pixel Sovereignty" instruction. 

*Refining HEX:* Navy: ~#1B263B Light Blue: ~#7FB3D5 
*Refining Material:* Reference says "Algodon y poliester", visual confirms a knit texture. 
*Final Polish of the Spanish terms:* TIPO: Boxer
...
```

---

## 3. LÓGICA DE LIMPIEZA ACTUAL (AIService.js)

```javascript
  extraerContenido(text) {
    if (!text) return "";
    let clean = text.replace(/```json|```/g, "").trim();
    
    // Intento de eliminación de ruido por patrones
    const noisePatterns = [
      /\*?Self-Correction[\s\S]*?(?=\n\n|\n[A-Z_]+:|$)/gi,
      /\*?Reasoning[\s\S]*?(?=\n\n|\n[A-Z_]+:|$)/gi,
      /Refining [\w]+:[\s\S]*?(?=\n|$)/gi,
      /\*.*?\*/g 
    ];

    noisePatterns.forEach(pattern => {
      clean = clean.replace(pattern, "");
    });

    const firstField = "TIPO_PRENDA";
    const startIndex = clean.toUpperCase().indexOf(firstField);
    if (startIndex !== -1) clean = clean.substring(startIndex);

    return clean.trim();
  }
```

---

## 4. PREGUNTA PARA EL MODELO (Google AI Studio)

¿Por qué el modelo Gemma 4 persiste en generar razonamiento interno (Chain-of-Thought) y notas de "Self-Correction" a pesar de tener instrucciones explícitas en `[NEGATIVE_CONSTRAINTS]`? 

¿Qué cambio en la **arquitectura del prompt** o en la **lógica de extracción** recomiendas para que el modelo se comporte estrictamente como un motor de datos?
