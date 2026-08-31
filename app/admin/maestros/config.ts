export type TipoCampo = "text" | "select";

export interface CampoSelect {
  tabla: string;
  valor: string;
  etiqueta: string;
}

export interface MaestroCampo {
  key: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  select?: CampoSelect;
}

export interface MaestroConfig {
  slug: string;
  titulo: string;
  tabla: string;
  pk: string;
  pkGenerada: boolean; // true = uuid autogenerado (no se pide al crear); false = el gestor escribe el código
  campoAutoUsuario?: string; // columna que se rellena sola con el id del usuario actual al crear
  campos: MaestroCampo[];
  ordenarPor: string;
  requiereBusqueda?: boolean; // para tablas muy grandes (municipios): no cargar todo sin buscar antes
}

export const MAESTROS: MaestroConfig[] = [
  {
    slug: "apartamentos",
    titulo: "Apartamentos",
    tabla: "apartamentos",
    pk: "id",
    pkGenerada: true,
    campoAutoUsuario: "gestor_id",
    ordenarPor: "apartamento",
    campos: [
      { key: "apartamento", etiqueta: "Apartamento", tipo: "text", requerido: true },
      { key: "piso", etiqueta: "Piso", tipo: "text" },
      { key: "codigo_establecimiento", etiqueta: "Código establecimiento", tipo: "text" },
      { key: "num_registro", etiqueta: "Núm. registro", tipo: "text" },
      {
        key: "cliente_id",
        etiqueta: "Cliente",
        tipo: "select",
        select: { tabla: "clientes", valor: "id", etiqueta: "nombre" },
      },
      { key: "cru", etiqueta: "CRU", tipo: "text" },
    ],
  },
  {
    slug: "clientes",
    titulo: "Clientes",
    tabla: "clientes",
    pk: "id",
    pkGenerada: true,
    ordenarPor: "nombre",
    campos: [
      { key: "nombre", etiqueta: "Nombre", tipo: "text", requerido: true },
      { key: "email", etiqueta: "Email", tipo: "text" },
      { key: "telefono", etiqueta: "Teléfono", tipo: "text" },
    ],
  },
  {
    slug: "formas-pago",
    titulo: "Formas de pago",
    tabla: "formas_pago",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "descripcion",
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "descripcion", etiqueta: "Descripción", tipo: "text", requerido: true },
    ],
  },
  {
    slug: "municipios",
    titulo: "Municipios",
    tabla: "municipios",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "nombre",
    requiereBusqueda: true,
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "nombre", etiqueta: "Nombre", tipo: "text", requerido: true },
      {
        key: "provincia_codigo",
        etiqueta: "Provincia",
        tipo: "select",
        select: { tabla: "provincias", valor: "codigo", etiqueta: "nombre" },
      },
    ],
  },
  {
    slug: "origenes-reserva",
    titulo: "Orígenes de reserva",
    tabla: "origenes_reserva",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "nombre",
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "nombre", etiqueta: "Nombre", tipo: "text", requerido: true },
    ],
  },
  {
    slug: "paises",
    titulo: "Países",
    tabla: "paises",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "nombre",
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "nombre", etiqueta: "Nombre", tipo: "text", requerido: true },
    ],
  },
  {
    slug: "parentescos",
    titulo: "Parentescos",
    tabla: "parentescos",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "descripcion",
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "descripcion", etiqueta: "Descripción", tipo: "text", requerido: true },
    ],
  },
  {
    slug: "provincias",
    titulo: "Provincias",
    tabla: "provincias",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "nombre",
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "nombre", etiqueta: "Nombre", tipo: "text", requerido: true },
    ],
  },
  {
    slug: "sexos",
    titulo: "Sexo",
    tabla: "sexos",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "codigo",
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "descripcion", etiqueta: "Descripción", tipo: "text", requerido: true },
    ],
  },
  {
    slug: "tipos-documento",
    titulo: "Tipos de documento",
    tabla: "tipos_documento",
    pk: "codigo",
    pkGenerada: false,
    ordenarPor: "codigo",
    campos: [
      { key: "codigo", etiqueta: "Código", tipo: "text", requerido: true },
      { key: "descripcion", etiqueta: "Descripción", tipo: "text", requerido: true },
    ],
  },
];

export function buscarMaestro(slug: string) {
  return MAESTROS.find((m) => m.slug === slug);
}
