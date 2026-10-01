import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { PASSWORD_MIN } from '@moonbrand/shared/api/contract';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { Logo } from '../../ui/logo';
import { AuthSide } from './auth-side';

@Component({
  selector: 'mb-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AuthSide, Logo],
  styleUrl: './auth-layout.scss',
  template: `
    <mb-auth-side />
    <main class="main">
      <mb-logo class="mobile-logo" />
      <form (submit)="submit($event)" novalidate>
        <div class="head">
          <h1 class="title">Crea il tuo account</h1>
          <p class="body">Poi costruiamo insieme il primo brand: bastano cinque minuti.</p>
        </div>
        <div class="field">
          <label for="name">Nome</label>
          <input id="name" type="text" autocomplete="name" placeholder="Marco Sereni" [value]="name()"
            (input)="name.set($any($event.target).value)" />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" placeholder="nome@azienda.it" [value]="email()"
            (input)="email.set($any($event.target).value)" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="new-password" [placeholder]="'Almeno ' + passwordMin + ' caratteri'"
            [value]="password()" (input)="password.set($any($event.target).value)" />
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="btn btn-accent btn-lg btn-block submit" type="submit" [class.busy]="busy()" [disabled]="busy()">
          {{ busy() ? 'Creo l’account…' : 'Crea l’account' }}
        </button>
        <p class="caption switch">Hai già un account? <a routerLink="/login">Accedi</a></p>
      </form>
    </main>
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly passwordMin = PASSWORD_MIN;
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const problem = this.validate();
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signUp({ name: this.name().trim(), email: this.email().trim(), password: this.password() });
      await this.router.navigateByUrl('/onboarding');
    } catch (error) {
      this.error.set(errorMessage(error, 'Non riesco a creare l’account. Riprova tra poco.'));
    } finally {
      this.busy.set(false);
    }
  }

  private validate(): string | null {
    if (!this.name().trim()) return 'Scrivi il tuo nome.';
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) return 'Scrivi un indirizzo email valido.';
    if (this.password().length < PASSWORD_MIN) return `La password deve avere almeno ${PASSWORD_MIN} caratteri.`;
    return null;
  }
}
