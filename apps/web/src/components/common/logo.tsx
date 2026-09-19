import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import useProjectStore from "@/store/project";

type LogoProps = {
  className?: string;
};

/**
 * Símbolo y logotipo de Riuna (docs/marca.md §03).
 *
 * Va en SVG inline y no como <img> por dos razones: lo que es navy hereda de
 * `currentColor`, así que el lockup sigue al tema sin duplicar archivos; y el
 * logotipo se compone con la Geist de la propia aplicación, que es lo que evita
 * tener que trazar la tipografía en un asset aparte.
 *
 * Cada nodo es el negativo del otro: navy fuera y teal dentro donde entra el
 * trabajo, teal fuera y navy dentro donde sale. Esta es la versión completa; la
 * simplificada, sin núcleos, vive en public/favicon.svg y en el script de
 * iconos, porque por debajo de ~32 px el núcleo no cabe.
 */
export function Logo({ className }: LogoProps) {
  const { setProject } = useProjectStore();

  return (
    <Link
      onClick={() => {
        setProject(undefined);
      }}
      to="/dashboard"
      aria-label="Riuna"
      className={cn("flex w-fit items-center gap-2 text-primary", className)}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="size-6 shrink-0"
      >
        <path
          d="M8.93 23.07A10 10 0 0 1 23.07 8.93"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M8.93 23.07A10 10 0 0 0 23.07 8.93"
          className="stroke-brand"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <circle cx="8.93" cy="23.07" r="3.7" fill="currentColor" />
        <circle cx="23.07" cy="8.93" r="3.7" className="fill-brand" />
        <circle cx="8.93" cy="23.07" r="2.1" className="fill-brand" />
        <circle cx="23.07" cy="8.93" r="2.1" fill="currentColor" />
      </svg>
      <span className="font-semibold text-xl leading-none tracking-[-0.03em]">
        riuna
      </span>
    </Link>
  );
}
