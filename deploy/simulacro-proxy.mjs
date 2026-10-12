// Dentro del contenedor del humo del simulacro (deploy/simulacro.compose.yml):
// `localhost:5183` lleva a la web y `localhost:1347` a la API, como en el PC.
//
// Con sus nombres de servicio (`web`, `api`), el navegador veria dos sitios
// distintos y no mandaria la cookie de sesion de uno a otro (SameSite=Lax):
// fallaba cada prueba. `localhost` con dos puertos es un solo sitio, y ademas
// un contexto seguro, que el portapapeles del stand-up necesita.
import net from "node:net";

const routes = [
  { port: 5183, host: "web", target: 5173 },
  { port: 1347, host: "api", target: 1337 },
];

for (const { port, host, target } of routes) {
  net
    .createServer((client) => {
      const upstream = net.connect(target, host);
      client.pipe(upstream).pipe(client);
      client.on("error", () => upstream.destroy());
      upstream.on("error", () => client.destroy());
    })
    .listen(port, "127.0.0.1");
}
