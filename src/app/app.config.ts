import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

import { routes } from './app.routes';

/** Aura com superfícies em azul marinho e cor primária azul. */
const AzulMarinho = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{sky.50}', 100: '{sky.100}', 200: '{sky.200}', 300: '{sky.300}', 400: '{sky.400}',
      500: '{sky.500}', 600: '{sky.600}', 700: '{sky.700}', 800: '{sky.800}', 900: '{sky.900}', 950: '{sky.950}'
    },
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '#e8eef7',
          100: '#c9d6ea',
          200: '#a3b6d4',
          300: '#7d95ba',
          400: '#5a759d',
          500: '#3f5a80',
          600: '#2c4466',
          700: '#1f3556',
          800: '#142a48',
          900: '#10213a',
          950: '#0a1628'
        }
      }
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: AzulMarinho,
        options: { darkModeSelector: '.app-dark' }
      }
    })
  ]
};
