const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// Arquivos do aplicativo
app.use(express.static(__dirname));

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.warn("ATENÇÃO: MP_ACCESS_TOKEN ainda não foi configurado.");
}

const mpClient = ACCESS_TOKEN
  ? new MercadoPagoConfig({
      accessToken: ACCESS_TOKEN
    })
  : null;

const paymentApi = mpClient ? new Payment(mpClient) : null;

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Criar cobrança Pix de R$ 5,00
app.post("/api/create-pix", async (req, res) => {
  try {
    if (!paymentApi) {
      return res.status(500).json({
        error: "Mercado Pago ainda não configurado no servidor."
      });
    }

    const email =
      req.body?.email ||
      `cliente${Date.now()}@excellington.app`;

    const idempotencyKey = crypto.randomUUID();

    const result = await paymentApi.create({
      body: {
        transaction_amount: 5,
        description: "Acesso ao Carrinho Excellington",
        payment_method_id: "pix",
        payer: {
          email: email
        }
      },
      requestOptions: {
        idempotencyKey: idempotencyKey
      }
    });

    const transactionData =
      result.point_of_interaction?.transaction_data || {};

    res.json({
      success: true,
      paymentId: String(result.id),
      status: result.status,
      qrCode: transactionData.qr_code || "",
      qrCodeBase64: transactionData.qr_code_base64 || "",
      ticketUrl: transactionData.ticket_url || ""
    });

  } catch (error) {
    console.error("Erro ao criar Pix:", error);

    res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Não foi possível criar o pagamento Pix."
    });
  }
});

// Consultar situação do pagamento
app.get("/api/payment-status/:id", async (req, res) => {
  try {
    if (!paymentApi) {
      return res.status(500).json({
        error: "Mercado Pago ainda não configurado."
      });
    }

    const payment = await paymentApi.get({
      id: req.params.id
    });

    res.json({
      success: true,
      id: String(payment.id),
      status: payment.status,
      approved: payment.status === "approved"
    });

  } catch (error) {
    console.error("Erro ao consultar pagamento:", error);

    res.status(500).json({
      success: false,
      error: "Não foi possível consultar o pagamento."
    });
  }
});

// Webhook do Mercado Pago
app.post("/api/webhook", async (req, res) => {
  try {
    console.log("Webhook recebido:", JSON.stringify(req.body));

    if (
      req.body?.type === "payment" &&
      req.body?.data?.id &&
      paymentApi
    ) {
      const payment = await paymentApi.get({
        id: req.body.data.id
      });

      console.log(
        `Pagamento ${payment.id}: ${payment.status}`
      );
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("Erro no webhook:", error);
    res.sendStatus(200);
  }
});

// Inicialização
app.listen(PORT, () => {
  console.log(`Servidor Excellington rodando na porta ${PORT}`);
});
