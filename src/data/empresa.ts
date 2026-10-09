// Identificação do vendedor. É exigência do Decreto 7.962/2013 (comércio eletrônico): nome
// empresarial, CNPJ, endereço e meio de contato precisam estar visíveis no site. Os marcadores
// [[...]] são para o dono preencher; enquanto existirem, o site mostra o marcador como está.
export const empresa = {
  razaoSocial: "[[RAZAO_SOCIAL]]",
  cnpj: "[[CNPJ]]",
  endereco: "[[ENDERECO]]",
  emailContato: "support@excalisidian.com",
  hospedagemDoServidor: "[[HOSPEDAGEM_DO_SERVIDOR]]",
} as const;

export function ehMarcador(valor: string): boolean {
  return valor.includes("[[");
}
