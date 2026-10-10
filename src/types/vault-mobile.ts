import type { VaultAdapter } from "../vault/VaultAdapter";

export interface VaultMobile {
  id: string;
  nome: string;
}

export interface RegistroVaultsMobile {
  versao: 1;
  vaults: VaultMobile[];
  ultimoId: string | null;
}

export interface VaultAbertoMobile {
  vault: VaultMobile;
  adapter: VaultAdapter;
}
