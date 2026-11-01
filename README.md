# Cuaderno de clase RyFD — evaluación por criterios con Google Apps Script

Cuaderno de clase del profesorado para evaluar **por criterios de evaluación** una materia de diseño propio: **Robótica y Fabricación Digital I (RyFD I)**, 1.º de Bachillerato, que se imparte en el IES Murillo (Sevilla).

> Este repositorio está **limpio**: no contiene alumnado, notas, nombres de profesorado ni identificadores de cursos. Todos los datos viven en el Drive de quien lo instala.

## ¿Por qué existe?

RyFD I es una materia de **diseño propio** del centro. Por ese motivo no figura en el catálogo con el que trabaja el cuaderno del profesorado de Séneca, y en la práctica no resulta posible evaluarla por criterios en él. Este cuaderno cubre ese hueco: permite registrar la evaluación competencial criterio a criterio y obtener la calificación final conforme a la LOMLOE, con la misma lógica que se aplicaría a una materia del catálogo oficial.

## Qué hace

- Registro de evaluaciones por **actividad, alumno/a y criterio** (0–10) con rúbricas de seis niveles.
- **Cada criterio = media** de sus evaluaciones; **cada competencia específica = 90 % criterios de contenido + 10 % criterio transversal (T)**; **nota final = media de las competencias**.
- **Criterios editables por actividad**, también en actividades ya creadas.
- Conexión con **Google Classroom**: importar listado del curso, importar notas y exportarlas como **borrador**.
- **Importación del desglose por criterios** desde la hoja de progreso de los [cuadernos interactivos de Python](https://github.com/MrSpock74/cuadernos-interactivos-python-ryfd-1bach): una única nota de Classroom se reparte en notas por criterio.
- Informes en PDF y **copias de seguridad automáticas** en Drive.
- Los datos se guardan en un archivo JSON en **tu Drive**; nada sale de tu cuenta.

## Instalación

1. Crea un proyecto en [script.google.com](https://script.google.com).
2. Pega `Code.gs` (en el editor, `Código.gs`) y crea un archivo HTML por cada uno de estos: `index`, `app`, `model`, `ui`, `estilos`, `seed`, `engine`.
3. Activa «Mostrar el archivo de manifiesto» y pega el contenido de `appsscript.json` (incluye el servicio avanzado de Classroom y los permisos necesarios).
4. Ejecuta `listCourses` una vez para autorizar permisos.
5. **Implementar → Nueva implementación → Aplicación web** (ejecutar como *usuario que accede*).
6. (Opcional) Ejecuta `instalarBackupAutomatico` para programar copias de seguridad.

## Adaptarlo a otra materia

Los datos de la materia están en `seed.html`, en el objeto `AREAS`: competencias específicas, criterios (redacción docente y versión para el alumnado) y criterio transversal. Añade una entrada nueva con el mismo formato para otro curso o materia. La lógica de cálculo está en `engine.html`.

## Estructura

| Archivo | Contenido |
|---|---|
| `Code.gs` | Servidor: Drive, Classroom, desglose, copias de seguridad |
| `index.html` | Plantilla principal |
| `seed.html` | Datos de la materia (competencias y criterios) |
| `engine.html` | Cálculo de notas |
| `model.html` | Modelo de datos |
| `ui.html`, `app.html`, `estilos.html` | Interfaz y estilos |
| `appsscript.json` | Manifiesto y permisos |

## Créditos y licencia

Hecho con cariño por Manuel Romero Fraidía (IES Murillo), sobre una idea original de ProfeTonino.

Licencia [CC BY-NC-SA 4.0](LICENSE).
