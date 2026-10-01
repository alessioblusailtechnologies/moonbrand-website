import { useState } from 'react';

import { PASSWORD_MIN } from '@moonbrand/shared/api/contract';

import { errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { AuthScreen } from '../features/auth/auth-screen';
import { Button, Field } from '../ui/kit';
import { useToast } from '../ui/toast';

export default function Register() {
  const { signUp } = useSession();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = name.trim() && email.trim() && password.length >= PASSWORD_MIN;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await signUp({ name: name.trim(), email: email.trim(), password });
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a creare l’account. Riprova tra poco.'));
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Costruiamo la tua presenza"
      subtitle="Crea l’account: poi mi racconti il brand e lavoro io."
      footer={{ text: 'Hai già un account?', link: 'Accedi', href: '/login' }}
    >
      <Field label="Nome" value={name} onChangeText={setName} autoComplete="name" placeholder="Come ti chiami" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="nome@azienda.it"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        placeholder={`Almeno ${PASSWORD_MIN} caratteri`}
        onSubmitEditing={submit}
      />
      <Button label={busy ? 'Creo l’account…' : 'Crea l’account'} onPress={submit} busy={busy} disabled={!valid} />
    </AuthScreen>
  );
}
