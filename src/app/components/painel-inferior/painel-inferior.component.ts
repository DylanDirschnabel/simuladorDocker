import { Component, ElementRef, effect, inject } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { DockerEngineService } from '../../simulador/docker-engine.service';
import { tamanho } from '../../simulador/utils';

@Component({
  selector: 'app-painel-inferior',
  imports: [TabsModule],
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

  constructor() {
    effect(() => {
      this.eventos();
      setTimeout(() => {
        const painel = this.host.nativeElement.querySelector('.p-tabpanels');
        if (painel) painel.scrollTop = painel.scrollHeight;
      });
    });
  }

  hora(data: Date): string {
    return data.toLocaleTimeString('pt-BR');
  }
}
