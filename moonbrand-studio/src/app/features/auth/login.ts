import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { Logo } from '../../ui/logo';
import { AuthSide } from './auth-side';

@Component({
  selector: 'mb-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AuthSide, Logo],
  styleUrl: './auth-layout.scss',
  template: `
    <mb-auth-side />
    <main class="main">
      <mb-logo class="mobile-logo" />
      <form (submit)="submit($event)" novalidate>
        <div class="head">
          <h1 class="title">Bentornato</h1>
          <p class="body">Accedi per riprendere il lavoro sui tuoi brand.</p>
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" placeholder="nome@azienda.it" [value]="email()"
            (input)="email.set($any($event.target).value)" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" placeholder="La tua password"
            [value]="password()" (input)="password.set($any($event.target).value)" />
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="btn btn-primary btn-lg btn-block submit" type="submit" [class.busy]="busy()" [disabled]="busy()">
          {{ busy() ? 'Accedo…' : 'Accedi' }}
        </button>
        <p class="caption switch">Non hai un account? <a routerLink="/register">Registrati</a></p>
      </form>
    </main>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    if (!this.email().trim() || !this.password()) {
      this.error.set('Scrivi email e password.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signIn({ email: this.email(), password: this.password() });
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.error.set(errorMessage(error, 'Non riesco ad accedere. Riprova tra poco.'));
    } finally {
      this.busy.set(false);
    }
  }
}
