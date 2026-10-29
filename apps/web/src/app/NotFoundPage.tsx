import { LocationIcon } from '@primer/octicons-react';
import { Blankslate } from '@primer/react/experimental';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n/I18nProvider.tsx';

/** Une adresse sans vue : l'état vide de Primer (Blankslate), et le retour à la ligne d'usine. */
export function NotFoundPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <Blankslate spacious>
      <Blankslate.Visual>
        <LocationIcon size="medium" />
      </Blankslate.Visual>
      <Blankslate.Heading as="h1">{t.notFound.title}</Blankslate.Heading>
      <Blankslate.Description>{t.notFound.text}</Blankslate.Description>
      <Blankslate.PrimaryAction onClick={() => void navigate('/')}>
        {t.notFound.back}
      </Blankslate.PrimaryAction>
    </Blankslate>
  );
}
