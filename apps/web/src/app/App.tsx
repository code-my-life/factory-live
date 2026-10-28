import { BaseStyles } from '@primer/react';
import { ThemeProvider } from '@primer/react/next';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router/dom';
import { FactoryProvider } from '../data/FactoryProvider.tsx';
import { createDataSource } from '../data/createDataSource.ts';
import { MotionProvider } from '../ui/motion.tsx';
import { ColorModeProvider, primerColorMode, useColorMode } from './colorMode.tsx';
import { createAppRouter } from './router.tsx';

function PrimerTheme({ children }: { children: ReactNode }) {
  const { preference } = useColorMode();
  return (
    <ThemeProvider
      colorMode={primerColorMode(preference)}
      dayScheme="light"
      nightScheme="dark"
      contextOnly
    >
      <BaseStyles>{children}</BaseStyles>
    </ThemeProvider>
  );
}

export function App() {
  const [source] = useState(createDataSource);
  const [router] = useState(createAppRouter);
  return (
    <ColorModeProvider>
      <PrimerTheme>
        <MotionProvider>
          <FactoryProvider source={source}>
            <RouterProvider router={router} />
          </FactoryProvider>
        </MotionProvider>
      </PrimerTheme>
    </ColorModeProvider>
  );
}
