import asyncio

class BDD_Cache:
    MAX_SIZE = 100
    cache = {}
    _lock = asyncio.Lock()

    @classmethod
    async def add_to_cache(cls, key, value):
        async with cls._lock:
            if len(cls.cache) >= cls.MAX_SIZE:
                oldest_key = next(iter(cls.cache))
                cls.cache.pop(oldest_key)
            cls.cache[key] = value
