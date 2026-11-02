export type TipoCampo = "text" | "select" | "numero";

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
  enLista?: boolean; // false: solo en el formulario, no como columna de la tabla
  enlace?: "carpeta" | "documento"; // ID de Google Drive/Docs: se muestra un enlace para abrirlo
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
    ordenarPor: "piso",
    campos: [
      { key: "piso", etiqueta: "Piso", tipo: "text", requerido: true },
      { key: "nombre_en_canal", etiqueta: "Nombre en el channel manager", tipo: "text", enLista: false },
      { key: "codigo_establecimiento", etiqueta: "Código establecimiento", tipo: "text" },
      { key: "num_registro", etiqueta: "Núm. registro", tipo: "text", enLista: false },
      {
        key: "cliente_id",
        etiqueta: "Cliente",
        tipo: "select",
        select: { tabla: "clientes", valor: "id", etiqueta: "nombre" },
      },
      { key: "cru", etiqueta: "CRU", tipo: "text", enLista: false },
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
      { key: "codigo", etiqueta: "Código", tipo: "text" },
      { key: "nombre", etiqueta: "Nombre", tipo: "text", requerido: true },
      { key: "email", etiqueta: "Email", tipo: "text" },
      { key: "telefono", etiqueta: "Teléfono", tipo: "text" },
      { key: "drive_carpeta_id", etiqueta: "Carpeta raíz de contratos", tipo: "text", enlace: "carpeta" },
      { key: "drive_plantilla_id", etiqueta: "Plantilla de contrato", tipo: "text", enlace: "documento" },
      // Ingresos: tarifas vigentes. Cada línea nueva copia estos valores; cambiarlos no altera el histórico.
      { key: "prefijo_ingresos", etiqueta: "Prefijo nº ingresos (si no, el código)", tipo: "text", enLista: false },
      { key: "tarifa_checkin", etiqueta: "Ingresos · Facturado por Checkin (€)", tipo: "numero", enLista: false },
      { key: "tarifa_limpieza", etiqueta: "Ingresos · Facturado por Limpieza (€)", tipo: "numero", enLista: false },
      { key: "pct_comision_limpieza", etiqueta: "Ingresos · % comisión limpieza", tipo: "numero", enLista: false },
      { key: "iva_pct", etiqueta: "Ingresos · % IVA incluido en el precio", tipo: "numero", requerido: true, enLista: false },
      { key: "mo_checkin_bruto", etiqueta: "Ingresos · Hora MO Checkin bruto (€)", tipo: "numero", requerido: true, enLista: false },
      { key: "mo_checkin_neto", etiqueta: "Ingresos · Hora MO Checkin neto (€)", tipo: "numero", requerido: true, enLista: false },
      { key: "mo_limpieza_bruto", etiqueta: "Ingresos · Hora MO Limpieza bruto (€)", tipo: "numero", requerido: true, enLista: false },
      { key: "mo_limpieza_neto", etiqueta: "Ingresos · Hora MO Limpieza neto (€)", tipo: "numero", requerido: true, enLista: false },
      { key: "pisos_ocupacion", etiqueta: "Ingresos · Nº de pisos (para % ocupación)", tipo: "numero", requerido: true, enLista: false },
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
