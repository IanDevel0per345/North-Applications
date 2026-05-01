import aiohttp
from typing import Any, Dict, Optional
import json
import base64

from functions.database import database as db
from modules.loja.personalization.qr_customization import QRCodeGenerator

BASE_URL = "https://pay.visionapplications.com.br/api/v1"


def _sanitize_error_message(error_msg: str) -> str:
    """
    Remove informações técnicas (URLs, rotas de API, códigos HTTP) de mensagens de erro
    e retorna apenas mensagens amigáveis ao usuário
    """
    import re
    
    msg = str(error_msg)
    
    # Tentar extrair mensagem de erro de JSON se existir
    try:
        json_match = re.search(r'\{[^{}]*"mensagem"[^{}]*\}', msg, re.IGNORECASE)
        if json_match:
            json_str = json_match.group(0)
            json_data = json.loads(json_str)
            if isinstance(json_data, dict) and "mensagem" in json_data:
                return json_data["mensagem"]
    except:
        pass
    
    # Tentar extrair mensagem de erro de JSON com "message"
    try:
        json_match = re.search(r'\{[^{}]*"message"[^{}]*\}', msg, re.IGNORECASE)
        if json_match:
            json_str = json_match.group(0)
            json_data = json.loads(json_str)
            if isinstance(json_data, dict):
                if "message" in json_data:
                    msg_data = json_data["message"]
                    if isinstance(msg_data, dict) and "mensagem" in msg_data:
                        return msg_data["mensagem"]
                    elif isinstance(msg_data, str):
                        return msg_data
    except:
        pass
    
    # Remover URLs (http://, https://)
    msg = re.sub(r'https?://[^\s]+', '', msg)
    
    # Remover rotas de API (ex: /api/v1/create-efi-payment)
    msg = re.sub(r'/api/v\d+/[^\s]+', '', msg)
    msg = re.sub(r'/api/[^\s]+', '', msg)
    
    # Remover códigos HTTP no início (ex: 500, 400)
    msg = re.sub(r'^\d+\s+', '', msg)
    
    # Remover referências a BASE_URL ou URLs específicas
    msg = re.sub(r'pay\.visionapplications\.com\.br[^\s]*', '', msg, flags=re.IGNORECASE)
    
    # Limpar espaços múltiplos
    msg = re.sub(r'\s+', ' ', msg)
    
    # Remover dois pontos duplos ou pontos isolados no início
    msg = re.sub(r'^:\s*', '', msg)
    msg = msg.strip()
    
    # Se a mensagem ficou vazia ou muito curta, retornar mensagem genérica
    if not msg or len(msg) < 3:
        return "Erro ao processar pagamento. Verifique as configurações."
    
    return msg


async def _post_json(path: str, payload: Dict[str, Any], timeout: int = 20) -> Dict[str, Any]:
    url = f"{BASE_URL}/{path}"
    t = aiohttp.ClientTimeout(total=timeout)
    async with aiohttp.ClientSession(timeout=t) as session:
        async with session.post(url, json=payload) as resp:
            text = await resp.text()
            try:
                data = json.loads(text)
            except Exception:
                data = None
            if resp.status >= 400:
                # Sanitizar mensagem de erro antes de lançar exceção
                sanitized_msg = _sanitize_error_message(text)
                raise RuntimeError(sanitized_msg)
            if data is None:
                raise RuntimeError("Resposta inválida do servidor")
            return data


# Mercado Pago
async def create_mp_payment(token_mp: str, value: float) -> Dict[str, Any]:
    return await _post_json("create-mp-payment", {"token_mp": token_mp, "value": value})


async def create_mp_site_payment(
    token_mp: str,
    value: float,
    title: Optional[str] = None,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"token_mp": token_mp, "value": value}
    if title is not None:
        payload["title"] = title
    if description is not None:
        payload["description"] = description
    return await _post_json("create-mp-site-payment", payload)


# EfiBank (Efí)
async def create_efi_payment(
    client_id: str,
    client_secret: str,
    certificate: str,
    chave_pix: str,
    price: float,
    nome_pagador: str,
    cpf_pagador: str,
    passphrase: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "client_id": client_id,
        "client_secret": client_secret,
        "certificate": certificate,
        "chave_pix": chave_pix,
        "price": price,
        "nome_pagador": nome_pagador,
        "cpf_pagador": cpf_pagador,
    }
    if passphrase is not None:
        payload["passphrase"] = passphrase
    return await _post_json("create-efi-payment", payload)


# PagBank
async def create_pagbank_payment(
    token_pagbank: str,
    value: float,
    environment: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"token_pagbank": token_pagbank, "value": value}
    if environment is not None:
        payload["environment"] = environment
    result = await _post_json("create-pagbank-payment", payload)
    
    print(f"🔍 PagBank response keys: {list(result.keys())}")
    
    # Gerar QR code se houver código PIX
    if result.get("qr_codes") and len(result["qr_codes"]) > 0:
        qr_code_data = result["qr_codes"][0]
        print(f"🔍 PagBank qr_code_data keys: {list(qr_code_data.keys())}")
        pix_code = qr_code_data.get("text") or qr_code_data.get("qrcode")
        print(f"🔍 PagBank pix_code: {pix_code[:50] if pix_code else None}...")
        if pix_code:
            try:
                qr_bytes = await QRCodeGenerator.generate_custom_qr(pix_code)
                result["qr_code_bytes"] = qr_bytes
                result["pix_copia_cola"] = pix_code
                result["copy_paste"] = pix_code
                print(f"✅ PagBank QR code gerado: {len(qr_bytes)} bytes")
            except Exception as e:
                print(f"❌ PagBank erro ao gerar QR: {e}")
    else:
        print(f"⚠️ PagBank sem qr_codes no resultado")
    
    return result


# PicPay
async def create_picpay_payment(token_picpay: str, value: float) -> Dict[str, Any]:
    return await _post_json("create-picpay-payment", {"token_picpay": token_picpay, "value": value})


# PushinPay
async def create_pushinpay_payment(
    token_pushinpay: str,
    value: int,
    webhook_url: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"token_pushinpay": token_pushinpay, "value": value}
    if webhook_url is not None:
        payload["webhook_url"] = webhook_url
    result = await _post_json("create-pushinpay-payment", payload)
    
    print(f"🔍 PushinPay response keys: {list(result.keys())}")
    
    # Gerar QR code se houver código PIX
    pix_code = result.get("brcode") or result.get("pix_copia_cola") or result.get("qrcode") or result.get("copy_paste")
    print(f"🔍 PushinPay pix_code: {pix_code[:50] if pix_code else None}...")
    if pix_code:
        try:
            qr_bytes = await QRCodeGenerator.generate_custom_qr(pix_code)
            result["qr_code_bytes"] = qr_bytes
            result["pix_copia_cola"] = pix_code
            result["copy_paste"] = pix_code
            print(f"✅ PushinPay QR code gerado: {len(qr_bytes)} bytes")
        except Exception as e:
            print(f"❌ PushinPay erro ao gerar QR: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"⚠️ PushinPay sem código PIX no resultado")
    
    return result


# Stripe
async def create_stripe_payment(
    token_stripe: str,
    value: float,
    currency: str = "brl",
    success_url: str = "",
    cancel_url: str = "",
    title: Optional[str] = None,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "token_stripe": token_stripe,
        "value": value,
        "currency": currency,
        "success_url": success_url,
        "cancel_url": cancel_url,
    }
    if title is not None:
        payload["title"] = title
    if description is not None:
        payload["description"] = description
    return await _post_json("create-stripe-payment", payload)


# PayPal
async def create_paypal_payment(
    client_id: str,
    client_secret: str,
    value: float,
    currency: str = "BRL",
    return_url: str = "",
    cancel_url: str = "",
    title: Optional[str] = None,
    description: Optional[str] = None,
    environment: Optional[str] = None,
    sandbox: Optional[bool] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "client_id": client_id,
        "client_secret": client_secret,
        "value": value,
        "currency": currency,
        "return_url": return_url,
        "cancel_url": cancel_url,
    }
    if title is not None:
        payload["title"] = title
    if description is not None:
        payload["description"] = description
    if environment is not None:
        payload["environment"] = environment
    if sandbox is not None:
        payload["sandbox"] = sandbox
    return await _post_json("create-paypal-payment", payload)


# Asaas
async def create_asaas_payment_link(
    token_asaas: str,
    value: float,
    name: str = "Pagamento",
    description: Optional[str] = None,
    environment: Optional[str] = None,
    chargeType: Optional[str] = None,
    dueDateLimitDays: Optional[int] = None,
    return_url: Optional[str] = None,
    billingType: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "token_asaas": token_asaas,
        "value": value,
        "name": name,
    }
    if description is not None:
        payload["description"] = description
    if environment is not None:
        payload["environment"] = environment
    if chargeType is not None:
        payload["chargeType"] = chargeType
    if dueDateLimitDays is not None:
        payload["dueDateLimitDays"] = dueDateLimitDays
    if return_url is not None:
        payload["return_url"] = return_url
    if billingType is not None:
        payload["billingType"] = billingType
    return await _post_json("create-asaas-payment-link", payload)


async def create_asaas_pix_payment(
    token_asaas: str,
    value: float,
    customer: str,
    dueDate: Optional[str] = None,
    description: Optional[str] = None,
    environment: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "token_asaas": token_asaas,
        "value": value,
        "customer": customer,
    }
    if dueDate is not None:
        payload["dueDate"] = dueDate
    if description is not None:
        payload["description"] = description
    if environment is not None:
        payload["environment"] = environment
    return await _post_json("create-asaas-pix-payment", payload)


# Coinbase Commerce
async def create_coinbase_payment(
    token_coinbase: str,
    value: float,
    name: Optional[str] = None,
    description: Optional[str] = None,
    currency: str = "USD",
    redirect_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "token_coinbase": token_coinbase,
        "value": value,
        "currency": currency,
    }
    if name is not None:
        payload["name"] = name
    if description is not None:
        payload["description"] = description
    if redirect_url is not None:
        payload["redirect_url"] = redirect_url
    if cancel_url is not None:
        payload["cancel_url"] = cancel_url
    return await _post_json("create-coinbase-payment", payload)


# NOWPayments
async def create_nowpayments_invoice(
    token_nowpayments: str,
    value: float,
    currency: str = "USD",
    description: Optional[str] = None,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
    webhook_url: Optional[str] = None,
    order_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "token_nowpayments": token_nowpayments,
        "value": value,
        "currency": currency,
    }
    if description is not None:
        payload["description"] = description
    if success_url is not None:
        payload["success_url"] = success_url
    if cancel_url is not None:
        payload["cancel_url"] = cancel_url
    if webhook_url is not None:
        payload["webhook_url"] = webhook_url
    if order_id is not None:
        payload["order_id"] = order_id
    return await _post_json("create-nowpayments-invoice", payload)


def _load_config() -> dict:
    """Carrega configurações de pagamento do database"""
    return db.get_document("payment_configs") or {}


def _require(value: Optional[str], what: str) -> str:
    if not value:
        raise ValueError(f"Missing {what} in payment settings.")
    return value


def _efi_credentials() -> Dict[str, str]:
    from pathlib import Path
    cfg = _load_config().get("efibank") or {}
    client_id = cfg.get("client_id") or cfg.get("client")
    client_secret = cfg.get("client_secret") or cfg.get("token")
    pix_key = cfg.get("pix_key")
    cert_file = cfg.get("cert_file")
    cert_b64: Optional[str] = None
    if cert_file and Path(cert_file).exists():
        try:
            data = Path(cert_file).read_bytes()
            cert_b64 = base64.b64encode(data).decode("ascii")
        except Exception:
            cert_b64 = None
    return {
        "client_id": _require(client_id, "Efi client_id"),
        "client_secret": _require(client_secret, "Efi client_secret"),
        "pix_key": _require(pix_key, "Efi pix_key"),
        "certificate": _require(cert_b64, "Efi certificate (.p12)"),
    }


# Settings-backed wrappers

# Mercado Pago
async def create_mp_payment_from_settings(value: float) -> Dict[str, Any]:
    token = _require((_load_config().get("mercado_pago") or {}).get("access_token"), "Mercado Pago access_token")
    return await create_mp_payment(token, value)


async def create_mp_site_payment_from_settings(value: float, title: Optional[str] = None, description: Optional[str] = None) -> Dict[str, Any]:
    token = _require((_load_config().get("mercado_pago") or {}).get("access_token"), "Mercado Pago access_token")
    return await create_mp_site_payment(token, value, title=title, description=description)


# EfiBank
async def create_efi_payment_from_settings(
    price: float,
    nome_pagador: str,
    cpf_pagador: str,
    chave_pix: Optional[str] = None,
    passphrase: Optional[str] = None,
) -> Dict[str, Any]:
    creds = _efi_credentials()
    return await create_efi_payment(
        client_id=creds["client_id"],
        client_secret=creds["client_secret"],
        certificate=creds["certificate"],
        chave_pix=chave_pix or creds["pix_key"],
        price=price,
        nome_pagador=nome_pagador,
        cpf_pagador=cpf_pagador,
        passphrase=passphrase,
    )


# PagBank
async def create_pagbank_payment_from_settings(value: float, environment: Optional[str] = None) -> Dict[str, Any]:
    token = _require((_load_config().get("pagbank") or {}).get("token_pagbank"), "PagBank token")
    return await create_pagbank_payment(token, value, environment=environment)


# PicPay
async def create_picpay_payment_from_settings(value: float) -> Dict[str, Any]:
    token = _require((_load_config().get("picpay") or {}).get("token_picpay"), "PicPay token")
    return await create_picpay_payment(token, value)


# PushinPay
async def create_pushinpay_payment_from_settings(value: int, webhook_url: Optional[str] = None) -> Dict[str, Any]:
    token = _require((_load_config().get("pushinpay") or {}).get("token_pushinpay"), "PushinPay token")
    return await create_pushinpay_payment(token, value, webhook_url=webhook_url)


# Stripe
async def create_stripe_payment_from_settings(
    value: float,
    currency: str = "brl",
    success_url: str = "",
    cancel_url: str = "",
    title: Optional[str] = None,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    token = _require((_load_config().get("stripe") or {}).get("token_stripe"), "Stripe token")
    return await create_stripe_payment(
        token, value, currency=currency, success_url=success_url, cancel_url=cancel_url, title=title, description=description
    )


# PayPal
async def create_paypal_payment_from_settings(
    value: float,
    currency: str = "BRL",
    return_url: str = "",
    cancel_url: str = "",
    title: Optional[str] = None,
    description: Optional[str] = None,
    environment: Optional[str] = None,
    sandbox: Optional[bool] = None,
) -> Dict[str, Any]:
    cfg = _load_config().get("paypal") or {}
    client_id = _require(cfg.get("client_id"), "PayPal client_id")
    client_secret = _require(cfg.get("client_secret"), "PayPal client_secret")
    return await create_paypal_payment(
        client_id,
        client_secret,
        value,
        currency=currency,
        return_url=return_url,
        cancel_url=cancel_url,
        title=title,
        description=description,
        environment=environment,
        sandbox=sandbox,
    )


# Asaas
async def create_asaas_payment_link_from_settings(
    value: float,
    name: str = "Pagamento",
    description: Optional[str] = None,
    environment: Optional[str] = None,
    chargeType: Optional[str] = None,
    dueDateLimitDays: Optional[int] = None,
    return_url: Optional[str] = None,
    billingType: Optional[str] = None,
) -> Dict[str, Any]:
    token = _require((_load_config().get("asaas") or {}).get("token_asaas"), "Asaas token")
    return await create_asaas_payment_link(
        token,
        value,
        name=name,
        description=description,
        environment=environment,
        chargeType=chargeType,
        dueDateLimitDays=dueDateLimitDays,
        return_url=return_url,
        billingType=billingType,
    )


async def create_asaas_pix_payment_from_settings(
    value: float,
    customer: str,
    dueDate: Optional[str] = None,
    description: Optional[str] = None,
    environment: Optional[str] = None,
) -> Dict[str, Any]:
    token = _require((_load_config().get("asaas") or {}).get("token_asaas"), "Asaas token")
    return await create_asaas_pix_payment(
        token,
        value,
        customer,
        dueDate=dueDate,
        description=description,
        environment=environment,
    )


# Coinbase Commerce
async def create_coinbase_payment_from_settings(
    value: float,
    name: Optional[str] = None,
    description: Optional[str] = None,
    currency: str = "USD",
    redirect_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
) -> Dict[str, Any]:
    token = _require((_load_config().get("coinbase") or {}).get("token_coinbase"), "Coinbase token")
    return await create_coinbase_payment(
        token,
        value,
        name=name,
        description=description,
        currency=currency,
        redirect_url=redirect_url,
        cancel_url=cancel_url,
    )


# NOWPayments
async def create_nowpayments_invoice_from_settings(
    value: float,
    currency: str = "USD",
    description: Optional[str] = None,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
    webhook_url: Optional[str] = None,
    order_id: Optional[str] = None,
) -> Dict[str, Any]:
    token = _require((_load_config().get("nowpayments") or {}).get("token_nowpayments"), "NOWPayments token")
    return await create_nowpayments_invoice(
        token,
        value,
        currency=currency,
        description=description,
        success_url=success_url,
        cancel_url=cancel_url,
        webhook_url=webhook_url,
        order_id=order_id,
    )


__all__ = [
    # MP
    "create_mp_payment",
    "create_mp_site_payment",
    "create_mp_payment_from_settings",
    "create_mp_site_payment_from_settings",
    # Efi
    "create_efi_payment",
    "create_efi_payment_from_settings",
    # PagBank
    "create_pagbank_payment",
    "create_pagbank_payment_from_settings",
    # PicPay
    "create_picpay_payment",
    "create_picpay_payment_from_settings",
    # PushinPay
    "create_pushinpay_payment",
    "create_pushinpay_payment_from_settings",
    # Stripe
    "create_stripe_payment",
    "create_stripe_payment_from_settings",
    # PayPal
    "create_paypal_payment",
    "create_paypal_payment_from_settings",
    # Asaas
    "create_asaas_payment_link",
    "create_asaas_pix_payment",
    "create_asaas_payment_link_from_settings",
    "create_asaas_pix_payment_from_settings",
    # Coinbase
    "create_coinbase_payment",
    "create_coinbase_payment_from_settings",
    # NOWPayments
    "create_nowpayments_invoice",
    "create_nowpayments_invoice_from_settings",
]
