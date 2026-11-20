import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Img,
  Row,
  Column as Col,
} from '@react-email/components';
import * as React from 'react';

interface TenderNotificationProps {
  type:
    | 'TENDER_PLAN'
    | 'TENDER_ACTUAL'
    | 'TENDER_CHANGED'
    | 'TENDER_PROLONGATION'
    | 'TENDER_CLOSED'
    | 'TENDER_RESULT'
    | 'TENDER_MESSAGE_ANY'
    | 'TENDER_RATE_CARRIER'
    | 'TENDER_RATE_MANAGER';
  tenderId: string | number;
  domain: string;
  data: {
    id?: string | number;
    date?: string;
    endDate?: string;
    cargo?: string;
    requirements?: string;
    route?: string;
    duration?: string;
    step?: string;
    buyout?: boolean;
    message?: string;
    isWinner?: boolean;
    lotInfo?: string;
    tenderType?: string; // e.g. "Редукціон", "Аукціон"
    bestBid?: string | null; // поточна найкраща ставка, для TENDER_RATE_*
    bidFormatted?: string | null;
    rateTime?: string;
    url?: string;
  };
}

export const TenderNotificationTemplate = ({
  type,
  tenderId,
  domain,
  data,
}: TenderNotificationProps) => {
  const isRateNotification =
    type === 'TENDER_RATE_CARRIER' || type === 'TENDER_RATE_MANAGER';

  const resolvedTenderId = tenderId || data?.id || '—';
  const tenderUrl =
    data?.url ||
    (resolvedTenderId && resolvedTenderId !== '—'
      ? `${domain}/dashboard/tender/${resolvedTenderId}`
      : `${domain}/dashboard/tender/active`);

  const bidAmount = data?.bidFormatted || data?.bestBid || '—';

  const getHeaderInfo = () => {
    switch (type) {
      case 'TENDER_PLAN':
        return {
          title: 'Тендер заплановано',
          preview: `Повідомляємо про запланований тендер №${resolvedTenderId}`,
          mainText: `Повідомляємо, що ${data.date || ''} заплановано проведення тендеру №${resolvedTenderId}.`,
        };
      case 'TENDER_ACTUAL':
        return {
          title: `${data.tenderType || 'Редукціон'} запущено`,
          preview: `Запущено ${data.tenderType || 'редукціон'} №${resolvedTenderId}`,
          mainText: `Повідомляємо, що по замовленню №${resolvedTenderId} запущено ${data.tenderType || 'редукціон'}.`,
        };
      case 'TENDER_CHANGED':
        return {
          title: 'Зміни у тендері',
          preview: `В тендері №${resolvedTenderId} відбулися зміни`,
          mainText: `Повідомляємо Вам, що в тендері №${resolvedTenderId} відбулися зміни:`,
        };
      case 'TENDER_PROLONGATION':
        return {
          title: 'Пролонгація тендеру',
          preview: `По тендеру №${resolvedTenderId} змінено часові рамки`,
          mainText: `Повідомляємо Вам, що по тендеру №${resolvedTenderId} змінено часові рамки.`,
        };
      case 'TENDER_CLOSED':
        return {
          title: 'Прийом пропозицій завершено',
          preview: `Тендер №${resolvedTenderId} завершено`,
          mainText: `Повідомляємо, що прийом пропозицій по тендеру №${resolvedTenderId} завершено.`,
        };
      case 'TENDER_RESULT':
        return {
          title: 'Результати тендеру',
          preview: `Результати тендеру №${resolvedTenderId}: ${data.route}`,
          mainText: `Вдячні Вам за участь у тендері №${resolvedTenderId} (${data.route || ''}, ${data.cargo || ''}).`,
        };
      case 'TENDER_MESSAGE_ANY':
        return {
          title: 'Повідомлення по тендеру',
          preview: `Нове повідомлення по тендеру №${resolvedTenderId}`,
          mainText: `Повідомляємо Вам важливу інформацію по тендеру №${resolvedTenderId}:`,
        };
      case 'TENDER_RATE_CARRIER':
      case 'TENDER_RATE_MANAGER':
        return {
          title: `Оновлення ставки у тендері №${resolvedTenderId}`,
          preview: `Оновлення ставки у тендері №${resolvedTenderId}`,
          mainText: `Повідомляємо, що подано нову ставку ${bidAmount} до тендеру №${resolvedTenderId}.`,
        };
    }
  };

  const info = getHeaderInfo();

  return (
    <Html>
      <Head />
      <Preview>{info.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={`${domain}/logo.png`}
              width="140"
              height="40"
              alt="ICTender"
              style={logo}
            />
          </Section>

          <Section style={content}>
            {isRateNotification ? (
              <>
                <Heading style={h1}>
                  Оновлення ставки у тендері №{resolvedTenderId}
                </Heading>

                <Section style={rateMessageContainer}>
                  <Text style={paragraph}>Добрий день!</Text>
                  <Text style={paragraph}>
                    Повідомляємо, що подано нову ставку <b>{bidAmount}</b> до
                    тендеру <b>№{resolvedTenderId}</b>.
                  </Text>
                  {data.rateTime && (
                    <Text style={paragraph}>
                      Дата та час подання: <b>{data.rateTime}</b>
                    </Text>
                  )}
                </Section>
                {/* Лише інформація: без посилання на картку тендера й без кнопок */}
              </>
            ) : (
              <>
                <Heading style={h1}>{info.title}</Heading>
                <Text style={text}>{info.mainText}</Text>

                {(type === 'TENDER_CHANGED' ||
                  type === 'TENDER_PROLONGATION' ||
                  type === 'TENDER_MESSAGE_ANY') &&
                  data.message && (
                    <Section style={messageBox}>
                      <Text style={messageText}>{data.message}</Text>
                    </Section>
                  )}

                {type === 'TENDER_PROLONGATION' && data.endDate && (
                  <Text style={highlightText}>
                    Нова дата закінчення тендеру: <b>{data.endDate}</b>
                  </Text>
                )}

                {type === 'TENDER_CLOSED' && (
                  <Text style={subtext}>
                    Просимо вас слідкувати за подальшими етапами тендеру у системі
                    або звертати увагу на повідомлення, які надходитимуть на вашу
                    електронну адресу.
                  </Text>
                )}

                {type === 'TENDER_RESULT' && (
                  <Section style={resultBox}>
                    <Text style={resultBold}>
                      {data.isWinner
                        ? '🎉 Після ретельного розгляду всіх пропозицій було прийнято рішення обрати Вас переможцем!'
                        : 'По терезультатам тендеру було обрано переможцем іншого учасника.'}
                    </Text>
                    <Text style={subtext}>
                      Будемо раді бачити Вас у наступних тендерах і сподіваємося на
                      подальшу співпрацю.
                    </Text>
                  </Section>
                )}

                <Section style={btnContainer}>
                  <Link style={button} href={tenderUrl}>
                    {type === 'TENDER_RESULT'
                      ? 'Переглянути закупівлю'
                      : 'Переглянути тендер'}
                  </Link>
                </Section>

                {/* Details Table */}
                {type !== 'TENDER_CLOSED' &&
                  type !== 'TENDER_CHANGED' &&
                  type !== 'TENDER_MESSAGE_ANY' && (
                  <Section style={detailsContainer}>
                    <Text style={detailsTitle}>Деталі тендеру:</Text>
                    <Hr style={hr} />

                    <Row style={detailRow}>
                      <Col style={detailColLabel} width="40%">
                        Вантаж:
                      </Col>
                      <Col style={detailColValue}>{data.cargo || '—'}</Col>
                    </Row>
                    <Row style={detailRow}>
                      <Col style={detailColLabel}>Вимоги ТЗ:</Col>
                      <Col style={detailColValue}>{data.requirements || '—'}</Col>
                    </Row>
                    <Row style={detailRow}>
                      <Col style={detailColLabel}>Маршрут:</Col>
                      <Col style={detailColValue}>{data.route || '—'}</Col>
                    </Row>

                    {data.duration && (
                      <Row style={detailRow}>
                        <Col style={detailColLabel}>Тривалість:</Col>
                        <Col style={detailColValue}>{data.duration}</Col>
                      </Row>
                    )}

                    {data.step && (
                      <Row style={detailRow}>
                        <Col style={detailColLabel}>Крок ставки:</Col>
                        <Col style={detailColValue}>{data.step}</Col>
                      </Row>
                    )}

                    {data.buyout !== undefined && (
                      <Row style={detailRow}>
                        <Col style={detailColLabel}>Можливість викупу:</Col>
                        <Col style={detailColValue}>
                          {data.buyout ? 'Так ✅' : 'Ні'}
                        </Col>
                      </Row>
                    )}
                  </Section>
                )}
              </>
            )}

            <Hr style={hr} />
            <Text style={footer}>
              Ви отримали це повідомлення, оскільки підписані на сповіщення ICTender.<br />
              Керувати налаштуваннями або <Link href={`${domain}/dashboard/settings`} style={unsubscribeLink}>відписатися</Link> можна в особистому кабінеті.<br />
              <br />
              З повагою, команда ICTender.<br />
              <Link href="https://ict.lviv.ua" style={footerLink}>ict.lviv.ua</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
const main = {
  backgroundColor: '#f4f7f9',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  width: '580px',
  maxWidth: '100%',
};

const header = {
  padding: '32px',
  textAlign: 'center' as const,
};

const logo = {
  margin: '0 auto',
};

const content = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '40px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const h1 = {
  color: '#1e293b',
  fontSize: '24px',
  fontWeight: '800',
  lineHeight: '1.2',
  margin: '0 0 16px',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const text = {
  color: '#475569',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
};

const highlightText = {
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  color: '#1e40af',
  fontSize: '14px',
  padding: '12px',
  textAlign: 'center' as const,
  margin: '20px 0',
};

const messageBox = {
  backgroundColor: '#f8fafc',
  borderLeft: '4px solid #3b82f6',
  padding: '16px',
  margin: '20px 0',
};

const messageText = {
  color: '#1e293b',
  fontSize: '15px',
  fontWeight: '500',
  margin: '0',
  fontStyle: 'italic',
};

const resultBox = {
  padding: '16px 0',
};

const resultBold = {
  color: '#1e293b',
  fontSize: '16px',
  fontWeight: '700',
  lineHeight: '24px',
  margin: '0 0 8px',
};

const subtext = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
};

const btnContainer = {
  textAlign: 'center' as const,
  margin: '32px 0 40px',
};

const button = {
  backgroundColor: '#1e40af',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: '800',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '18px 32px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  boxShadow: '0 4px 15px rgba(30, 64, 175, 0.3)',
};

const detailsContainer = {
  backgroundColor: '#fafafa',
  borderRadius: '12px',
  padding: '24px',
  margin: '24px 0',
};

const detailsTitle = {
  color: '#1e293b',
  fontSize: '12px',
  fontWeight: '800',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  margin: '0 0 10px',
};

const detailRow = {
  padding: '8px 0',
};

const detailColLabel = {
  color: '#64748b',
  fontSize: '13px',
  fontWeight: '600',
};

const detailColValue = {
  color: '#1e293b',
  fontSize: '13px',
  fontWeight: '700',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const footer = {
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: '18px',
  textAlign: 'center' as const,
  margin: '24px 0 0',
};

const footerLink = {
  color: "#1e40af",
  textDecoration: "underline",
  fontWeight: "600",
};

const unsubscribeLink = {
  color: "#64748b",
  textDecoration: "underline",
} as const;

const rateMessageContainer = {
  margin: '24px 0',
  textAlign: 'left' as const,
};

const paragraph = {
  color: '#334155',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

