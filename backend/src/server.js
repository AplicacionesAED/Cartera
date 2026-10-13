const app = require('./app');
const sequelize = require('./config/db');
const env = require('./config/env');

// Red de seguridad: un rechazo de promesa sin captura (en Node 20 por defecto
// tumba el proceso entero) se registra y la app sigue sirviendo a los demás
// usuarios. Una excepción síncrona sin captura SÍ deja el proceso en estado
// dudoso: se registra y se sale para que Docker/Coolify lo reinicie limpio.
process.on('unhandledRejection', (razon) => {
  console.error('[unhandledRejection]', razon); // eslint-disable-line no-console
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err); // eslint-disable-line no-console
  process.exit(1);
});

async function start() {
  await sequelize.authenticate();
  console.log('Conectado a PostgreSQL (Sequelize)'); // eslint-disable-line no-console

  const server = app.listen(env.PORT, () => {
    console.log(`Cartera AED backend escuchando en http://localhost:${env.PORT}`); // eslint-disable-line no-console
    // Calienta los caches de cartera en segundo plano (ver modules/precalentar.js).
    setTimeout(() => require('./modules/precalentar').precalentarTodo(), 3000).unref();
    // Sincronizaciones diarias automáticas (ver modules/programador.js).
    require('./modules/programador').iniciar();
  });

  // Windows: nodemon con signal SIGKILL puede tardar unos segundos en
  // liberar el puerto -- sin este handler, un puerto ocupado revienta con
  // un stack trace confuso en vez de un mensaje claro (ver nodemon.json).
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`El puerto ${env.PORT} ya esta en uso -- espera unos segundos a que se libere o cierra el proceso anterior.`); // eslint-disable-line no-console
      process.exit(1);
    }
    throw err;
  });
}

start().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err); // eslint-disable-line no-console
  process.exit(1);
});
