/**
 * Siembra el entorno de desarrollo con datos usables: un propietario, un
 * miembro raso, un espacio, tres proyectos y doce tareas.
 *
 *   pnpm dev:parallel     # en una terminal
 *   pnpm dev:seed         # en otra, una sola vez
 *
 * Va por HTTP contra la API y no contra la base directamente **porque las
 * contrasenas las cifra Better Auth**: escribir las filas a mano daria usuarios
 * con los que no se puede entrar. Es el mismo camino que usan las fixtures de
 * las pruebas de extremo a extremo.
 *
 * Es seguro repetirlo: si el propietario ya existe, no toca nada.
 */
const WEB_PORT = process.env.DEV_WEB_PORT || "5273";
const API_PORT = process.env.DEV_API_PORT || "1437";
const API = process.env.DEV_SEED_API || `http://127.0.0.1:${API_PORT}`;
// Better Auth valida el `Origin` contra `RIUNA_CLIENT_URL`, que `dev-parallel.sh`
// fija al puerto de la web.
const ORIGIN = process.env.DEV_SEED_ORIGIN || `http://localhost:${WEB_PORT}`;

const OWNER = {
  email: "dev@riuna.local",
  password: "Dev-passw0rd!",
  name: "Desarrollo",
};
const MEMBER = {
  email: "miembro@riuna.local",
  password: "Miembro-passw0rd!",
  name: "Miembro Raso",
};

/** Una sesion con su propio tarro de cookies. */
function session() {
  const jar = [];
  return async function call(method, path, body) {
    const res = await fetch(`${API}${path}`, {
      method: method.toUpperCase(),
      headers: {
        "content-type": "application/json",
        Origin: ORIGIN,
        ...(jar.length ? { cookie: jar.join("; ") } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of res.headers.getSetCookie?.() ?? []) {
      const pair = cookie.split(";")[0];
      const name = pair.split("=")[0];
      const at = jar.findIndex((entry) => entry.startsWith(`${name}=`));
      if (at >= 0) jar[at] = pair;
      else jar.push(pair);
    }
    const text = await res.text();
    if (!res.ok)
      throw new Error(
        `${method} ${path} -> ${res.status} ${text.slice(0, 300)}`,
      );
    return text ? JSON.parse(text) : null;
  };
}

// La API tarda unos doce segundos en escuchar: migra antes de abrir el puerto.
async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`${API}/api/config`);
      if (res.ok) return;
    } catch {
      // Todavia no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `La API no responde en ${API}. Arranca antes 'pnpm dev:parallel'.`,
  );
}

await waitForApi();

const owner = session();

try {
  await owner("post", "/api/auth/sign-in/email", {
    email: OWNER.email,
    password: OWNER.password,
  });
  console.log("Ya estaba sembrado; no se ha tocado nada.");
  report();
  process.exit(0);
} catch {
  // No existe todavia: se siembra.
}

const signUp = await owner("post", "/api/auth/sign-up/email", {
  email: OWNER.email,
  password: OWNER.password,
  name: OWNER.name,
});

const workspace = await owner("post", "/api/auth/organization/create", {
  name: "Servitec",
  slug: "servitec",
});
await owner("post", "/api/auth/organization/set-active", {
  organizationId: workspace.id,
});

const projects = [
  ["Obra Norte", "obra", "Building2"],
  ["SAT", "sat", "Wrench"],
  ["Reforma Estación", "reforma", "Hammer"],
];

const titles = [
  ["Revisar cuadro eléctrico", "high"],
  ["Acta de replanteo", "medium"],
  ["Presupuesto planta baja", "urgent"],
  ["Inventario de repuestos", "low"],
];

for (const [name, slug, icon] of projects) {
  const project = await owner("post", "/api/project", {
    name,
    workspaceId: workspace.id,
    icon,
    slug,
  });
  for (const [title, priority] of titles) {
    await owner("post", `/api/task/${project.id}`, {
      title,
      description: "",
      status: "to-do",
      priority,
      userId: signUp.user.id,
    });
  }
}

// El miembro raso existe para comprobar lo que NO se ve: la barra lateral sin
// el grupo de administracion, y los 403 de la API.
const member = session();
await member("post", "/api/auth/sign-up/email", MEMBER);
// El propietario le concede el acceso directamente, sin invitacion que aceptar
// (ADR 035).
await owner("post", `/api/workspace/${workspace.id}/member`, {
  email: MEMBER.email,
});

report(workspace.id);

function report(workspaceId) {
  console.log("");
  console.log(`  propietario  ${OWNER.email}  /  ${OWNER.password}`);
  console.log(`  miembro raso ${MEMBER.email}  /  ${MEMBER.password}`);
  if (workspaceId) console.log(`  espacio      ${workspaceId}`);
  console.log(`  entrada      http://localhost:${WEB_PORT}`);
  console.log("");
}
