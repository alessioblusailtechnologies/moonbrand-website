import { useState } from 'react';

import { errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { AuthScreen } from '../features/auth/auth-screen';
import { Button, Field } from '../ui/kit';
import { useToast } from '../ui/toast';

export default function Login() {
  const { signIn } = useSession();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password });
    } catch (error) {
      toast(errorMessage(error, 'Non riesco ad accedere. Riprova tra poco.'));
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Accedi a Moonbrand"
      subtitle="Idee, contenuti e piano del tuo brand, dal telefono."
      footer={{ text: 'Non hai un account?', link: 'Registrati', href: '/register' }}
    >
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="nome@azienda.it"
        returnKeyType="next"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        placeholder="La tua password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={busy ? 'Accedo…' : 'Accedi'} onPress={submit} busy={busy} disabled={!email.trim() || !password} />
    </AuthScreen>
  );
}
