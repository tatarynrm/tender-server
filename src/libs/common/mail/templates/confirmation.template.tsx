import { Html } from '@react-email/html';
import { Body, Heading, Link, Tailwind, Text } from '@react-email/components';
import * as React from 'react';
interface ConfirmationTemplateProps {
  domain: string;
  token: string;
}
export function ConfirmationTemplate({
  domain,
  token,
}: ConfirmationTemplateProps) {
  const confirmLink = `${domain}/auth/new-verification?token=${token}`;

  return (
    <Tailwind>
      <Html>
        <Body className="text-black">
          <Heading>Підтвердження пошти</Heading>
          <Text>
            Привіт.Щоб підтвердити пошту, перейдіть будь ласка по даній ссилці
          </Text>

          <Link href={confirmLink}>Підвердіть пошту</Link>
          <Text>
            Це посилання валідне 1 годину.Якщо ви не запрошували даний лист ,
            просто його проігноруйте
          </Text>
          <Text>Дякуємо!</Text>
        </Body>
      </Html>
    </Tailwind>
  );
}
