"""
WebSocket Manager for Vision Bot
Uses pure websockets library with uvloop for high performance
"""
import asyncio
import json
import logging
import traceback
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta
import uuid

# Try to use uvloop for better performance
try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
    _USING_UVLOOP = True
except ImportError:
    _USING_UVLOOP = False

import websockets
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK

logger = logging.getLogger(__name__)


class WSManager:
    """WebSocket Manager using pure websockets + asyncio + uvloop"""
    
    def __init__(self, bot):
        self.bot = bot
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        self.should_reconnect = True
        self.reconnect_interval = 5
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = float('inf')
        
        # Configuration
        self.server_url = None
        self.jwt_secret = None
        self.bot_id = None
        
        # Event handlers
        self.handlers: Dict[str, Callable] = {}
        
        # Pending requests for request-response pattern
        self.pending_requests: Dict[str, asyncio.Future] = {}
        
        # Tasks
        self._listen_task = None
        self._reconnect_task = None
        
        logger.info(f"WSManager initialized (uvloop: {_USING_UVLOOP})")
    
    async def initialize(self):
        """Initialize the WebSocket manager"""
        try:
            config = self._load_config()
            
            ws_config = config.get('websocket_manager', {})
            self.server_url = ws_config.get('server_url', 'wss://cloud.visionapplications.com.br')
            self.jwt_secret = ws_config.get('jwt_secret', 'vision_secret_key')
            
            bot_config = config.get('bot', {})
            self.bot_id = bot_config.get('botID', 'VisionBot')
            
            # Register default handlers
            self._register_default_handlers()
            
            # Auto-start if configured
            if ws_config.get('auto_start', True):
                asyncio.create_task(self.connect())
            
            logger.info("WSManager initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize WSManager: {e}")
            traceback.print_exc()
    
    def _load_config(self) -> dict:
        """Load configuration from files"""
        config = {}
        
        try:
            with open('configs/config_websocket.json', 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load websocket config: {e}")
        
        try:
            with open('config.json', 'r', encoding='utf-8') as f:
                config['bot'] = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load main config: {e}")
        
        return config
    
    def _generate_token(self) -> str:
        """Generate JWT token for authentication"""
        try:
            import jwt
            
            payload = {
                'botId': self.bot_id,
                'discordId': str(self.bot.user.id) if self.bot.user else None,
                'exp': datetime.utcnow() + timedelta(hours=24),
                'iat': datetime.utcnow()
            }
            
            return jwt.encode(payload, self.jwt_secret, algorithm='HS256')
        except ImportError:
            # Simple fallback if PyJWT not installed
            import base64
            payload = json.dumps({
                'botId': self.bot_id,
                'discordId': str(self.bot.user.id) if self.bot.user else None,
            })
            return base64.b64encode(payload.encode()).decode()
    
    def _register_default_handlers(self):
        """Register default event handlers"""
        
        @self.on('connected')
        async def on_connected(data):
            logger.info(f"✅ Connected to server: {data.get('message')}")
        
        @self.on('auth_log')
        async def on_auth_log(data):
            print(f"📨 [WS] Auth log received for processing")
            # Use the process_auth_log from update_api
            try:
                from modules.cloud.update_api import process_auth_log
                await process_auth_log(data)
                print(f"✅ [WS] Auth log processed successfully")
            except ImportError as e:
                print(f"❌ [WS] Could not import process_auth_log: {e}")
            except Exception as e:
                print(f"❌ [WS] Error processing auth_log: {e}")
        
        @self.on('redeem_gift')
        async def on_redeem_gift(data):
            logger.info(f"🎁 Redeem gift received: {data}")
            try:
                from .handlers import handle_redeem_gift
                await handle_redeem_gift(self.bot, data)
            except ImportError:
                pass
        
        @self.on('remove_verified_role')
        async def on_remove_role(data):
            logger.info(f"🗑️ Remove role received: {data}")
            try:
                from .handlers import handle_remove_role
                await handle_remove_role(self.bot, data)
            except ImportError:
                pass
    
    def on(self, event: str):
        """Decorator to register event handler"""
        def decorator(func):
            self.handlers[event] = func
            return func
        return decorator
    
    async def connect(self):
        """Connect to WebSocket server with automatic reconnection"""
        while self.should_reconnect:
            try:
                token = self._generate_token()
                
                # Convert http/https to ws/wss if needed
                ws_url = self.server_url
                if ws_url.startswith('http://'):
                    ws_url = 'ws://' + ws_url[7:]
                elif ws_url.startswith('https://'):
                    ws_url = 'wss://' + ws_url[8:]
                elif not ws_url.startswith('ws://') and not ws_url.startswith('wss://'):
                    ws_url = 'ws://' + ws_url
                
                uri = f"{ws_url}?token={token}"
                
                logger.info(f"🔌 Connecting to {ws_url}...")
                
                async with websockets.connect(
                    uri,
                    ping_interval=20,
                    ping_timeout=60,
                    close_timeout=10,
                    max_size=10_000_000,  # 10MB max message
                ) as ws:
                    self.ws = ws
                    self.connected = True
                    self.reconnect_attempts = 0
                    
                    logger.info("✅ WebSocket connected!")
                    
                    # Send bot info
                    await self._send_bot_info()
                    
                    # Listen for messages
                    await self._listen()
                    
            except ConnectionClosedError as e:
                logger.warning(f"⚠️ Connection closed: {e}")
            except ConnectionClosedOK:
                logger.info("Connection closed normally")
            except Exception as e:
                logger.error(f"❌ Connection error: {e}")
                traceback.print_exc()
            
            # Reconnection logic
            self.connected = False
            self.ws = None
            
            if self.should_reconnect:
                self.reconnect_attempts += 1
                wait_time = min(self.reconnect_interval * (1.5 ** (self.reconnect_attempts - 1)), 60)
                logger.info(f"🔄 Reconnecting in {wait_time:.1f}s (attempt {self.reconnect_attempts})...")
                await asyncio.sleep(wait_time)
    
    async def _send_bot_info(self):
        """Send bot information after connecting"""
        try:
            config = self._load_config()
            bot_config = config.get('bot', {})
            
            guilds = []
            if self.bot.guilds:
                guilds = [str(g.id) for g in self.bot.guilds]
            
            data = {
                'bot_id': str(self.bot.user.id) if self.bot.user else None,
                'unique_id': bot_config.get('botID'),
                'server_id': bot_config.get('bot', {}).get('server'),
                'oauth_client_id': None,  # Will be loaded from cloud config
                'guilds': guilds
            }
            
            # Try to load oauth_client_id from cloud config
            try:
                from functions.database import database as db
                cloud_config = db.get_document('cloud_data') or {}
                data['oauth_client_id'] = cloud_config.get('client_id')
            except Exception:
                pass
            
            await self.send('bot_connected', data)
            logger.info(f"📤 Bot info sent ({len(guilds)} guilds)")
            
        except Exception as e:
            logger.error(f"Failed to send bot info: {e}")
    
    async def _listen(self):
        """Listen for incoming messages"""
        print("🎧 [WS] _listen loop started")
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    event = data.get('event')
                    payload = data.get('data', {})
                    
                    # Debug log - show ALL incoming messages
                    print(f"📥 [WS] Received: event={event}, requestId={payload.get('requestId')}")
                    
                    # Check for response to pending request
                    if event and event.endswith('_response'):
                        request_id = payload.get('requestId')
                        print(f"📥 [WS] Response event: {event}, requestId: {request_id}, pending: {list(self.pending_requests.keys())[:3]}")
                        if request_id and request_id in self.pending_requests:
                            future = self.pending_requests.pop(request_id)
                            if not future.done():
                                print(f"✅ [WS] Resolved request: {request_id[:8]}...")
                                future.set_result(payload)
                            continue
                        else:
                            print(f"⚠️ [WS] requestId {request_id} not in pending")
                    
                    # Dispatch to handler
                    if event and event in self.handlers:
                        try:
                            asyncio.create_task(self.handlers[event](payload))
                        except Exception as e:
                            print(f"❌ [WS] Handler error for {event}: {e}")
                    
                except json.JSONDecodeError:
                    print("❌ [WS] Failed to parse message as JSON")
                except Exception as e:
                    print(f"❌ [WS] Error processing message: {e}")
                    
        except Exception as e:
            print(f"❌ [WS] Listen loop error: {e}")
    
    async def send(self, event: str, data: dict, request_id: str = None):
        """Send a message to the server"""
        if not self.ws or not self.connected:
            logger.warning(f"Cannot send {event}: not connected")
            return False
        
        try:
            msg = {
                'event': event,
                'data': data,
                'timestamp': datetime.utcnow().isoformat()
            }
            # Add requestId at TOP LEVEL (not inside data) - API expects this
            if request_id:
                msg['requestId'] = request_id
            
            message = json.dumps(msg)
            await self.ws.send(message)
            print(f"📤 [WS] Sent: {event}, requestId={request_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to send {event}: {e}")
            return False
    
    async def request(self, event: str, data: dict, timeout: float = 30.0) -> dict:
        """Send a request and wait for response"""
        request_id = str(uuid.uuid4())
        
        print(f"📤 [WS] Request: {event} (id: {request_id[:8]}...)")
        
        # Create future for response using running loop
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()
        
        future = loop.create_future()
        self.pending_requests[request_id] = future
        
        print(f"📋 [WS] Pending: {list(self.pending_requests.keys())[:3]}")
        
        try:
            # Send request with requestId at TOP LEVEL
            success = await self.send(event, data, request_id=request_id)
            if not success:
                self.pending_requests.pop(request_id, None)
                return {'success': False, 'message': 'Failed to send request'}
            
            print(f"⏳ [WS] Waiting for response (timeout: {timeout}s)...")
            
            # Wait for response
            result = await asyncio.wait_for(future, timeout=timeout)
            print(f"✅ [WS] Got response for {event}")
            return result
            
        except asyncio.TimeoutError:
            self.pending_requests.pop(request_id, None)
            print(f"❌ [WS] Timeout for {event} (id: {request_id[:8]}...)")
            return {'success': False, 'message': 'Request timeout'}
        except Exception as e:
            self.pending_requests.pop(request_id, None)
            print(f"❌ [WS] Error in request {event}: {e}")
            return {'success': False, 'message': str(e)}
    
    async def disconnect(self):
        """Disconnect from server"""
        self.should_reconnect = False
        
        if self.ws:
            await self.ws.close()
        
        self.connected = False
        self.ws = None
        logger.info("Disconnected from WebSocket")
    
    def is_connected(self) -> bool:
        """Check if connected"""
        return self.connected and self.ws is not None
    
    # ============================================
    # API Methods (similar to old websocket_manager)
    # ============================================
    
    async def register_bot(self, main_bot_id: str, token: str, client_secret: str, client_id: str) -> dict:
        """Register bot with API"""
        return await self.request('register', {
            'mainBotId': main_bot_id,
            'token': token,
            'clientSecret': client_secret,
            'clientId': client_id
        })
    
    async def synchronize(self, bot_id: str, sync_data: dict = None) -> dict:
        """Synchronize data with API"""
        return await self.request('synchronization', {
            'botId': bot_id,
            'syncData': sync_data
        })
    
    async def get_gifts(self, bot_id: str) -> dict:
        """Get gifts for bot"""
        return await self.request('get_gifts', {'botId': bot_id})
    
    async def create_gift(self, bot_id: str, gift_data: dict) -> dict:
        """Create a new gift"""
        return await self.request('create_gift', {
            'botId': bot_id,
            'giftData': gift_data
        })
    
    async def delete_gift(self, gift_id: str) -> dict:
        """Delete a gift"""
        return await self.request('delete_gift', {'giftId': gift_id})
    
    async def update_definitions(self, definitions: dict) -> dict:
        """Update bot definitions"""
        config = self._load_config()
        bot_config = config.get('bot', {})
        
        cloud_config = {}
        try:
            from functions.database import database as db
            cloud_config = db.get_document('cloud_data') or {}
        except Exception:
            pass
        
        return await self.request('update_definitions', {
            'bot_id': cloud_config.get('client_id'),
            'definitions': definitions,
            'main_server_id': bot_config.get('bot', {}).get('server')
        })
    
    async def check_user_verification(self, bot_id: str, user_id: str) -> dict:
        """Check if user is verified"""
        return await self.request('check_user_verification', {
            'botId': bot_id,
            'userId': user_id
        })
    
    async def list_members(self, bot_id: str) -> dict:
        """List members for bot"""
        return await self.request('list_members', {'botId': bot_id})
    
    async def check_auth_count(self, bot_id: str) -> dict:
        """Check authenticated member count"""
        return await self.request('check_auth_count', {'botId': bot_id})
    
    async def recover_data(self, bot_id: str) -> dict:
        """Recover bot data"""
        return await self.request('recover', {'botId': bot_id})
    
    # ============================================
    # Backwards Compatibility Methods
    # ============================================
    
    def set_bot(self, bot):
        """Set bot instance (backwards compatibility)"""
        self.bot = bot
    
    async def start(self):
        """Start connection (backwards compatibility alias for connect)"""
        # Initialize configuration
        try:
            config = self._load_config()
            ws_config = config.get('websocket_manager', {}) or config.get('websocket_cloud', {})
            self.server_url = ws_config.get('server_url', 'wss://cloud.visionapplications.com.br')
            self.jwt_secret = ws_config.get('jwt_secret', 'vision_secret_key')
            
            bot_config = config.get('bot', {})
            self.bot_id = bot_config.get('botID', 'VisionBot')
            
            self._register_default_handlers()
        except Exception as e:
            logger.error(f"Error loading config: {e}")
        
        # Start connection in background
        asyncio.create_task(self.connect())
    
    async def stop(self):
        """Stop connection (backwards compatibility alias for disconnect)"""
        await self.disconnect()
    
    def set_callbacks(self, on_connect=None, on_disconnect=None, on_error=None, on_message=None):
        """Set callbacks (backwards compatibility - uses event handlers instead)"""
        if on_connect:
            self.handlers['_on_connect'] = on_connect
        if on_disconnect:
            self.handlers['_on_disconnect'] = on_disconnect
        if on_error:
            self.handlers['_on_error'] = on_error
        if on_message:
            # Store message callback for dispatching all events
            self._on_message_callback = on_message
    
    async def resend_bot_connected(self):
        """Resend bot_connected event (backwards compatibility)"""
        await self._send_bot_info()


