import { Heading, Link, Text } from '@primer/react';
import { Link as RouterLink } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <Heading as="h1" variant="medium">
        Page introuvable
      </Heading>
      <Text as="p">
        Cette adresse ne correspond à aucune vue.{' '}
        <Link as={RouterLink} to="/" inline>
          Revenir à la ligne d’usine
        </Link>
      </Text>
    </section>
  );
}
