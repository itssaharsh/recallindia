"""Shared code for every RecallIndia Lambda.

Imported everywhere as ``from common.<module> import ...``; shipped to Lambda as the
``CommonLayer`` (resolves from ``/opt/python``) and used locally with ``backend/`` on
``sys.path``. Every external call has a ``DEMO_MODE=1`` fixture path with the same shape.
"""
