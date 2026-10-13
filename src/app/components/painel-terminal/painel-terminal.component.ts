import { AfterViewChecked, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DockerCliService } from '../../simulador/docker-cli.service';
import { TipoLinha } from '../../simulador/modelos';

interface LinhaTerminal {
  tipo: TipoLinha | 'comando';
  texto: string;
}

@Component({
  selector: 'app-painel-terminal',
  imports: [FormsModule],
  templateUrl: './painel-terminal.component.html',
  styleUrl: './painel-terminal.component.css'
})
export class PainelTerminalComponent implements AfterViewChecked {
  @ViewChild('entrada') entrada!: ElementRef<HTMLInputElement>;
  @ViewChild('terminal') terminal!: ElementRef<HTMLDivElement>;

  private readonly cli = inject(DockerCliService);
  private readonly historico: string[] = [];
  private posicaoHistorico = 0;
  private rolarParaFim = false;

  readonly prompt = 'user@host:~$';
  comando = '';
  linhas: LinhaTerminal[] = [
    { tipo: 'saida', texto: 'Simulador Docker. Digite "help" para ver os comandos disponíveis.' }
  ];

  executar(): void {
    const texto = this.comando;
    this.linhas.push({ tipo: 'comando', texto });
    this.comando = '';
    this.rolarParaFim = true;

    if (texto.trim()) {
      if (this.historico[this.historico.length - 1] !== texto) this.historico.push(texto);
      const resultado = this.cli.executar(texto);
      if (resultado.limpar) this.linhas = [];
      this.linhas.push(...resultado.linhas);
    }
    this.posicaoHistorico = this.historico.length;
  }

  navegarHistorico(evento: Event, direcao: -1 | 1): void {
    evento.preventDefault();
    const nova = this.posicaoHistorico + direcao;
    if (nova < 0 || nova > this.historico.length) return;
    this.posicaoHistorico = nova;
    this.comando = this.historico[nova] ?? '';
  }

  limpar(evento: Event): void {
    evento.preventDefault();
    this.linhas = [];
  }

  focar(): void {
    if (!window.getSelection()?.toString()) this.entrada.nativeElement.focus();
  }

  ngAfterViewChecked(): void {
    if (this.rolarParaFim) {
      const el = this.terminal.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.rolarParaFim = false;
    }
  }
}
