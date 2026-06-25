from slowapi import Limiter
from slowapi.util import get_remote_address

# Define the central rate limiter using the remote address of the client
limiter = Limiter(key_func=get_remote_address)
