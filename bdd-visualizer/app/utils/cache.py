class BDD_Cache:
    MAX_SIZE = 100
    cache = {}

    @classmethod
    def add_to_cache(cls, key, value):
        if len(cls.cache) >= cls.MAX_SIZE:
            oldest_key = next(iter(cls.cache))
            cls.cache.pop(oldest_key)
        cls.cache[key] = value
