import { Component, ElementRef, effect, inject } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { descreverComando } from '../../simulador/descricoes';
import { DockerEngineService } from '../../simulador/docker-engine.service';
import { tamanho } from '../../simulador/utils';

@Component({
  selector: 'app-painel-inferior',
  imports: [TabsModule, TooltipModule],
  templateUrl: './painel-inferior.component.html',
  styleUrl: './painel-inferior.component.css'
})
export class PainelInferiorComponent {
  private readonly engine = inject(DockerEngineService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly operacao = this.engine.ultimaOperacao;
  readonly eventos = this.engine.eventos;
  readonly disco = this.engine.discoImagens;
  readonly tamanho = tamanho;
  readonly descrever = descreverComando;

  aba: string | number = 'kernel';

  constructor() {
    // Na aba Eventos, mostra o mais recente (embaixo); nas outras, volta ao topo.
    effect(() => {
      this.eventos();
      this.operacao();
      setTimeout(() => this.rolar());
    });
  }

  rolar(): void {
    const painel = this.host.nativeElement.querySelector('.p-tabpanels');
    if (painel) painel.scrollTop = this.aba === 'eventos' ? painel.scrollHeight : 0;
  }

  hora(data: Date): string {
    return data.toLocaleTimeString('pt-BR');
  }
}
