import { createContext, useContext } from "react";

const PerfilContexto = createContext({ role: "consulta", active: true });
export const PerfilProveedor = PerfilContexto.Provider;
export const usePerfil = () => useContext(PerfilContexto);
