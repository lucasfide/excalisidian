// Impede uma janela de console extra no Windows em release. NÃO REMOVER.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    excalisidian_lib::run()
}
