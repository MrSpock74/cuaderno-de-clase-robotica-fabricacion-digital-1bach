/**
 * Cuaderno RyFD — servidor (Google Apps Script).
 * Sirve la app web y guarda el estado en un fichero JSON del Drive del propio docente.
 * Importa el alumnado desde Google Classroom. (La exportación de notas se afina en la fase 2.)
 */

/** Incluye un fichero HTML del proyecto dentro de la plantilla (para partir el código en piezas). */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Punto de entrada de la app web. Inyecta el estado guardado del Drive del usuario. */
function doGet() {
  var t = HtmlService.createTemplateFromFile('index');
  t.stateJson = getState();
  return t.evaluate()
    .setTitle('Cuaderno RyFD')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------------- Carpeta de trabajo organizada ----------------
// La app crea (si no existe) una carpeta raíz con subcarpetas Datos / Informes / Resúmenes.
// La carpeta raíz se localiza por su identificador guardado en las propiedades del
// usuario (igual que el fichero de datos), así que puedes moverla donde quieras sin
// que la app pierda la referencia ni cree una carpeta duplicada.
var CARPETA_RAIZ = 'Cuaderno de Robótica y Fabricación Digital 26-27';
var CARPETA_RAIZ_ID_PROPERTY = 'raizFolderId';

function carpeta_(nombre, parent) {
  var it = parent.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : parent.createFolder(nombre);
}

function raiz_() {
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty(CARPETA_RAIZ_ID_PROPERTY);

  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {
      // El id guardado ya no es válido (carpeta borrada); se vuelve a buscar/crear abajo.
    }
  }

  // Primera vez, o el id guardado no vale: busca por nombre en TODO el
  // Drive (no solo en la raíz), la encuentre donde la hayas movido.
  var it = DriveApp.getFoldersByName(CARPETA_RAIZ);
  var folder = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(CARPETA_RAIZ);

  props.setProperty(CARPETA_RAIZ_ID_PROPERTY, folder.getId());
  return folder;
}

function sub_(nombre) { return carpeta_(nombre, raiz_()); }

// ---------------- Almacenamiento en Drive ----------------
// Un único fichero JSON por docente, dentro de la subcarpeta "Datos".
// Guardamos su id en las propiedades del usuario para no tener que buscarlo cada vez.
function getFile_() {
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty('fileId');
  if (id) { try { return DriveApp.getFileById(id); } catch (e) {} }
  var file = sub_('Datos').createFile('CuadernoRyFD.json', '{}', 'application/json');
  props.setProperty('fileId', file.getId());
  return file;
}

/** Devuelve el estado (JSON como texto). '{}' la primera vez. */
function getState() {
  try { return getFile_().getBlob().getDataAsString() || '{}'; }
  catch (e) { return '{}'; }
}

/** Guarda el estado (lo llama el cliente con "debounce"). */
function saveState(json) {
  getFile_().setContent(json);
  return true;
}

// ---------------- Google Classroom ----------------
/** Cursos activos en los que el docente imparte. */
function listCourses() {
  var res = Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] });
  return (res.courses || []).map(function (c) { return { id: c.id, name: c.name }; });
}

/** Alumnado de un curso → lista de nombres (tal y como figuran en su cuenta). */
function importRoster(courseId) {
  var out = [], token = null;
  do {
    var res = Classroom.Courses.Students.list(courseId, { pageSize: 100, pageToken: token });
    (res.students || []).forEach(function (s) {
      out.push({ nombre: s.profile.name.fullName, classroomId: s.userId });
    });
    token = res.nextPageToken;
  } while (token);
  return out;
}

// ---------------- PDF (resumen del planificador) ----------------
/** Crea un PDF a partir de HTML y lo guarda en la subcarpeta según el tipo. Devuelve su URL. */
function crearPDF(nombre, html, tipo) {
  var pdf = Utilities.newBlob(html, 'text/html', nombre + '.html').getAs('application/pdf').setName(nombre + '.pdf');
  var destino = (tipo === 'informe') ? sub_('Informes') : (tipo === 'resumen') ? sub_('Resúmenes') : raiz_();
  return destino.createFile(pdf).getUrl();
}

/** Tareas (coursework) de un curso, para elegir de dónde importar o a dónde exportar. */
function listCoursework(courseId) {
  var res = Classroom.Courses.CourseWork.list(courseId, {
    orderBy: 'updateTime desc', pageSize: 40,
    courseWorkStates: ['PUBLISHED', 'DRAFT'] // sin esto, la API solo devuelve las publicadas
  });
  return (res.courseWork || []).map(function (w) {
    return { id: w.id, title: w.title, maxPoints: w.maxPoints || 0, state: w.state };
  });
}

/** Temas (topics) del curso, para agrupar tareas igual que en la propia Classroom. */
function listTopics(courseId) {
  var out = [], token = null;
  do {
    var res = Classroom.Courses.Topics.list(courseId, { pageToken: token });
    (res.topic || []).forEach(function (t) { out.push({ id: t.topicId, name: t.name }); });
    token = res.nextPageToken;
  } while (token);
  return out;
}

/** Crea un tema nuevo en el curso y lo devuelve. */
function crearTopic(courseId, nombre) {
  var t = Classroom.Courses.Topics.create({ name: nombre }, courseId);
  return { id: t.topicId, name: t.name };
}

/** Importa las notas de una tarea → [{classroomId, nota}] normalizadas a /10. */
function importGrades(courseId, courseWorkId) {
  var work = Classroom.Courses.CourseWork.get(courseId, courseWorkId);
  var max = work.maxPoints || 10;
  var out = [], token = null;
  do {
    var res = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, courseWorkId, { pageToken: token });
    (res.studentSubmissions || []).forEach(function (s) {
      var g = (s.assignedGrade != null) ? s.assignedGrade : s.draftGrade;
      out.push({ classroomId: s.userId, nota: (g == null ? null : (g / max * 10)) });
    });
    token = res.nextPageToken;
  } while (token);
  return { maxPoints: max, grades: out };
}

/**
 * Lee el desglose por criterios que guarda la app de Python (hoja "Progreso_…" de cada cuaderno).
 * sheetId = id o URL de esa hoja de calculo. Devuelve
 *   { items: [{classroomId, definitiva, puntos:{}, max:{}, nota10}], sinCorreo: n }
 * El correo de la hoja se cruza con el alumnado del curso de Classroom.
 */
function leerDesglose(courseId, sheetId) {
  var m = String(sheetId || '').match(/\/d\/([a-zA-Z0-9-_]+)/);
  var id = m ? m[1] : String(sheetId || '').trim();
  if (!id) throw new Error('Falta la hoja de la app de Python.');
  var ss = SpreadsheetApp.openById(id);
  // Sirve para cualquier app mia: busca la pestaña que tenga las columnas "email" y "desglose_json"
  // (da igual que se llame Progreso_RFD1_Python, Progreso_RFD1_PracticaExtra, etc.).
  var datos = null, cab = null, iEmail = -1, iDes = -1, hojas = ss.getSheets();
  for (var h = 0; h < hojas.length; h++) {
    var v = hojas[h].getDataRange().getValues();
    if (!v.length) continue;
    var c = v[0].map(function (x) { return String(x).trim(); });
    if (c.indexOf('email') >= 0 && c.indexOf('desglose_json') >= 0) { datos = v; cab = c; break; }
  }
  if (!datos) throw new Error('No encuentro ninguna pestaña con las columnas "email" y "desglose_json" en esa hoja (¿has actualizado la app de Python a la v3 y guardado alguna corrección?).');
  iEmail = cab.indexOf('email'); iDes = cab.indexOf('desglose_json');

  var idPorCorreo = {}, token = null;
  do {
    var res = Classroom.Courses.Students.list(courseId, { pageSize: 100, pageToken: token });
    (res.students || []).forEach(function (s) {
      var mail = s.profile && s.profile.emailAddress;
      if (mail) idPorCorreo[String(mail).toLowerCase()] = s.userId;
    });
    token = res.nextPageToken;
  } while (token);

  var items = [], sinCorreo = 0;
  for (var i = 1; i < datos.length; i++) {
    var mail = String(datos[i][iEmail] || '').toLowerCase();
    if (!mail || !datos[i][iDes]) continue;
    var d; try { d = JSON.parse(datos[i][iDes]); } catch (e) { continue; }
    var uid = idPorCorreo[mail];
    if (!uid) { sinCorreo++; continue; }
    items.push({ classroomId: uid, definitiva: !!d.definitiva, puntos: d.puntos || {}, max: d.max || {}, nota10: d.nota10 });
  }
  return { items: items, sinCorreo: sinCorreo };
}

/**
 * Exporta notas a Classroom. grades = [{classroomId, nota}] en escala /10.
 * Si `courseWorkId` viene, escribe en esa tarea; si no, crea una nueva con `titulo`.
 * Escala la nota /10 a los puntos (maxPoints) de la tarea. Fija draftGrade y assignedGrade.
 */
function exportGrades(courseId, courseWorkId, titulo, grades, descripcion, borrador, topicId) {
  var work;
  if (courseWorkId) {
    work = Classroom.Courses.CourseWork.get(courseId, courseWorkId);
  } else {
    var payload = { title: titulo || 'Cuaderno RyFD', description: descripcion || '', workType: 'ASSIGNMENT',
      state: borrador ? 'DRAFT' : 'PUBLISHED', maxPoints: 10 };
    if (topicId) payload.topicId = topicId;
    work = Classroom.Courses.CourseWork.create(payload, courseId);
  }
  var max = work.maxPoints || 10;

  // Mientras la tarea siga en borrador, Classroom todavía no tiene entregas que consultar
  // (no se asignan hasta publicarla). Solo se crea/vincula; las notas se vuelcan más
  // adelante, cuando vuelvas a exportar tras publicarla tú mismo en Classroom.
  if (work.state === 'DRAFT') {
    return { courseWorkId: work.id, publicadas: 0, maxPoints: max };
  }

  var byUser = {}, token = null;
  do {
    var res = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, work.id, { pageToken: token });
    (res.studentSubmissions || []).forEach(function (s) { byUser[s.userId] = s.id; });
    token = res.nextPageToken;
  } while (token);
  var n = 0;
  grades.forEach(function (g) {
    var subId = byUser[g.classroomId];
    if (subId && g.nota != null) {
      var pts = Math.round(g.nota / 10 * max * 100) / 100;
      Classroom.Courses.CourseWork.StudentSubmissions.patch(
        { draftGrade: pts, assignedGrade: pts }, courseId, work.id, subId, { updateMask: 'draftGrade,assignedGrade' });
      n++;
    }
  });
  return { courseWorkId: work.id, publicadas: n, maxPoints: max };
}

// ---------------- Copia de seguridad automática ----------------
var BACKUP_RETENCION = 30; // cuántas copias fechadas conservar como máximo

/**
 * Crea una copia de seguridad fechada de HOY dentro de la subcarpeta
 * "Copias de seguridad" (si ya existe una de hoy, no hace nada). Poda
 * las copias más antiguas por encima de BACKUP_RETENCION.
 * La llama tanto el disparador diario automático como el botón manual.
 */
function backupAutomatico() {
  var zona = Session.getScriptTimeZone() || 'Europe/Madrid';
  var hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  var nombre = 'CuadernoRyFD-backup-' + hoy + '.json';
  var carpeta = sub_('Copias de seguridad');

  if (carpeta.getFilesByName(nombre).hasNext()) return; // ya hay copia de hoy

  carpeta.createFile(nombre, getState(), 'application/json');

  // Poda: conserva solo las BACKUP_RETENCION copias más recientes.
  var archivos = [], it = carpeta.getFiles();
  while (it.hasNext()) archivos.push(it.next());
  archivos.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = BACKUP_RETENCION; i < archivos.length; i++) archivos[i].setTrashed(true);
}

/**
 * Ejecuta esta función UNA SOLA VEZ (a mano, desde el editor) para
 * activar la copia de seguridad diaria automática. Es seguro volver a
 * ejecutarla por error: si el disparador ya existe, no crea otro.
 */
function instalarBackupAutomatico() {
  var yaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'backupAutomatico';
  });
  if (yaExiste) {
    Logger.log('Ya existe un disparador de backupAutomatico. No se ha creado otro.');
    return;
  }
  ScriptApp.newTrigger('backupAutomatico').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Disparador diario creado: backupAutomatico se ejecutará cada noche, entre las 3 y las 4.');
}