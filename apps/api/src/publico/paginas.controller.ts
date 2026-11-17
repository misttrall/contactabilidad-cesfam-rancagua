import { Controller, Get, Header } from '@nestjs/common';
import { Publico } from '../auth/decoradores';

/**
 * Páginas públicas que Meta exige para publicar la app de WhatsApp (política de privacidad e
 * instrucciones de eliminación de datos). Sin datos ni sesión; solo texto estático.
 * El texto describe la DEMO (datos ficticios): para el piloto real debe reemplazarse por la política
 * vigente de la Dirección de Salud, tras la revisión legal (ver docs/mvp/privacidad/).
 */
function pagina(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${titulo} · BusinessHub Salud</title>
</head>
<body>
<main>
<h1>${titulo}</h1>
${cuerpo}
</main>
</body>
</html>
`;
}

export const POLITICA_PRIVACIDAD_HTML = pagina(
  'Política de privacidad',
  `<p><strong>BusinessHub Salud · Contactabilidad CESFAM</strong> es un prototipo de demostración que ayuda a confirmar horas de atención por WhatsApp. Esta versión es una <strong>demostración con datos 100 % ficticios</strong>: no se usan ni se almacenan datos reales de pacientes.</p>
<h2>Qué datos se tratan</h2>
<ul>
<li>Datos ficticios de pacientes y citas (nombre, RUT de prueba, fecha y hora de la cita).</li>
<li>Números de WhatsApp de las personas del equipo del proyecto, con su consentimiento, para recibir mensajes de prueba.</li>
</ul>
<h2>Para qué se usan</h2>
<p>Solo para enviar y recibir mensajes de confirmación de horas de prueba y mostrar el funcionamiento del sistema. No se venden, no se ceden a terceros ni se usan para publicidad.</p>
<h2>Cómo se protegen</h2>
<p>Los teléfonos se almacenan cifrados, el acceso al sistema requiere inicio de sesión con roles y las acciones quedan registradas en una bitácora. Los mensajes viajan a través de la plataforma WhatsApp Business (Meta).</p>
<h2>Tus derechos</h2>
<p>Puedes pedir acceso, rectificación o eliminación de tus datos, o dejar de recibir mensajes escribiendo <strong>BAJA</strong> al número desde el que te escribimos. Más detalles en <a href="/eliminacion-datos">cómo solicitar la eliminación de tus datos</a>.</p>
<p>Si el proyecto pasa a un piloto con datos reales, esta política será reemplazada por la de la institución responsable, con base legal y convenios definidos.</p>`,
);

export const ELIMINACION_DATOS_HTML = pagina(
  'Eliminación de datos',
  `<p>Para solicitar la eliminación de tus datos de la demostración de BusinessHub Salud:</p>
<ol>
<li>Escribe <strong>BAJA</strong> por WhatsApp al número desde el que recibiste el mensaje: dejarás de recibir mensajes de inmediato.</li>
<li>Pide al equipo del proyecto (el contacto indicado en la ficha de esta aplicación en Meta) que elimine tus datos. Se anonimiza tu registro y las llamadas asociadas, y queda constancia en la bitácora.</li>
</ol>
<p>Las demostraciones usan datos ficticios, por lo que normalmente no hay datos reales que eliminar, salvo el número de WhatsApp de quienes participaron en las pruebas.</p>`,
);

@Controller()
export class PaginasPublicasController {
  @Get('politica-privacidad')
  @Publico()
  @Header('Content-Type', 'text/html; charset=utf-8')
  politica(): string {
    return POLITICA_PRIVACIDAD_HTML;
  }

  @Get('eliminacion-datos')
  @Publico()
  @Header('Content-Type', 'text/html; charset=utf-8')
  eliminacion(): string {
    return ELIMINACION_DATOS_HTML;
  }
}
