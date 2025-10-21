import { Html } from '@react-email/html';
import { Body, Heading, Link, Tailwind, Text } from '@react-email/components';
import * as React from 'react';
interface ResetPasswordTemplateProps {
  token: string;
}
export function TwoFactorAuthTemplate({ token }: ResetPasswordTemplateProps) {
  return (
    <Tailwind>
      <Html>
        <Body className="text-black">
          <Heading>Двухфакторна автентифікація</Heading>
          <Text>
            Привіт! Введи цей код в браузері для заваршення процесу авторизації.
          </Text>

          <Text className="text-3xl">{token} </Text>
          <Text>
            Цей код дійсний протягом 15 хвилин.
          </Text>
          <Text>Дякуємо!</Text>
        </Body>
      </Html>
    </Tailwind>
  );
}
