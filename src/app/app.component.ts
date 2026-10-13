import { Component } from '@angular/core';
import { MenubarModule } from 'primeng/menubar';
import { SplitterModule } from 'primeng/splitter';
import { PainelVisualizacaoComponent } from './components/painel-visualizacao/painel-visualizacao.component';
import { PainelTerminalComponent } from './components/painel-terminal/painel-terminal.component';
import { PainelInferiorComponent } from './components/painel-inferior/painel-inferior.component';

@Component({
  selector: 'app-root',
  imports: [MenubarModule, SplitterModule, PainelVisualizacaoComponent, PainelTerminalComponent, PainelInferiorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {}
