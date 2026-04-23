import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface PasswordChangedTemplateProps {
  userName?: string;
}

export const PasswordChangedTemplate = ({
  userName,
}: PasswordChangedTemplateProps) => (
  <Html>
    <Head />
    <Preview>Ваш пароль успішно змінено</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Пароль змінено</Heading>
        <Section style={section}>
          <Text style={text}>
            Вітаємо{userName ? `, ${userName}` : ''}!
          </Text>
          <Text style={text}>
            Ваш пароль до облікового запису в системі ICT Tender був успішно змінений.
          </Text>
          <Text style={text}>
            Якщо ви не здійснювали цю дію, будь ласка, негайно зверніться до нашої служби підтримки або скористайтеся функцією відновлення пароля.
          </Text>
          <Text style={footer}>
            З повагою, команда ICT.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default PasswordChangedTemplate;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const section = {
  padding: '0 48px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '30px 0',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  textAlign: 'left' as const,
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '20px',
};
