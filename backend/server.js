require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const BLACKCAT_API_URL = 'https://api.blackcatoficial.com/api';

// Verificar se as chaves existem no ambiente
if (!process.env.HIGHNOTE_SECRET_KEY) {
  console.warn('AVISO: HIGHNOTE_SECRET_KEY (Blackcat API Key) não está definida no ambiente.');
}

// Configurações de Segurança
app.use(cors({
  // Permitir apenas requisições da origem do front-end na produção
  // origin: 'https://seusite.com', 
  origin: '*' // Em dev, permite todas.
}));

app.use(express.json());

// Limite de taxa básico para evitar abuso
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por IP
  message: { success: false, message: 'Muitas requisições, tente novamente mais tarde.' }
});
app.use(limiter);

// 1. Criar Cobrança (Pix)
app.post('/api/create-sale', async (req, res) => {
  try {
    const { amount, customer, items, ...utmPayload } = req.body;

    // Validação básica do valor e formato no servidor
    if (!amount || amount < 1000) { // mínimo R$ 10,00 (em centavos)
      return res.status(400).json({ success: false, message: 'Valor mínimo é R$ 10,00' });
    }

    if (!customer || !customer.document || !customer.document.number) {
      return res.status(400).json({ success: false, message: 'Dados do cliente incompletos' });
    }

    // Garantir que os dados vitais não sejam forjados
    const requestBody = {
      amount: amount,
      currency: "BRL",
      paymentMethod: "pix",
      items: [
        {
          title: "Doação - FAZER O BEM BRASIL LTDA",
          unitPrice: amount,
          quantity: 1,
          tangible: false
        }
      ],
      customer: {
        name: customer.name || 'Anonimo',
        email: customer.email || 'anonimo@gmail.com',
        phone: customer.phone || '11999999999',
        document: {
          number: customer.document.number,
          type: "cpf"
        }
      },
      ...utmPayload
    };

    const response = await fetch(`${BLACKCAT_API_URL}/sales/create-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.HIGHNOTE_SECRET_KEY
      },
      body: JSON.stringify(requestBody)
    });

    const body = await response.json();

    if (!body || body.success !== true || !body.data) {
      console.error('Erro na API Blackcat ao criar venda');
      return res.status(500).json({ success: false, message: 'Erro ao gerar cobrança' });
    }

    // Retorna apenas o que o front-end precisa
    const { transactionId, paymentData } = body.data;
    res.json({
      success: true,
      data: {
        transactionId,
        paymentData: {
          copyPaste: paymentData.copyPaste,
          qrCodeBase64: paymentData.qrCodeBase64
        }
      }
    });

  } catch (error) {
    console.error('Erro interno ao processar create-sale:', error.message);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

// 2. Consultar Status do Pix
app.get('/api/status/:txid', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid) {
      return res.status(400).json({ success: false, message: 'txid inválido' });
    }

    const response = await fetch(`${BLACKCAT_API_URL}/sales/${encodeURIComponent(txid)}/status`, {
      method: 'GET',
      headers: {
        'X-API-Key': process.env.HIGHNOTE_SECRET_KEY
      },
      cache: 'no-store'
    });

    const body = await response.json();
    
    // Retornamos de forma segura apenas o status
    res.json({
      success: true,
      data: {
        status: body?.data?.status || body?.status || 'pending'
      }
    });

  } catch (error) {
    console.error('Erro interno ao processar status:', error.message);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
