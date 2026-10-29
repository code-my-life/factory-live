import { Heading, Link, Text } from '@primer/react';
import { Link as RouterLink } from 'react-router';
import { useI18n } from '../i18n/I18nProvider.tsx';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section>
      <Heading as="h1" variant="medium">
        {t.notFound.title}
      </Heading>
      <Text as="p">
        {t.notFound.text}{' '}
        <Link as={RouterLink} to="/" inline>
          {t.notFound.back}
        </Link>
      </Text>
    </section>
  );
}
