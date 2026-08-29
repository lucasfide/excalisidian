// Logotipo (doc 06): "«Excalisidian» em Fraunces 600 a 16px, e abaixo dele uma régua de 2px
// em `musgo` com 40% da largura da palavra, alinhada à esquerda. Nada mais."

export default function Logotipo() {
  return (
    <div className="leading-none">
      <div className="font-display text-[16px] font-semibold leading-none text-tinta">
        Excalisidian
      </div>
      <div aria-hidden className="mt-1 h-[2px] w-[42%] bg-musgo" />
    </div>
  );
}
