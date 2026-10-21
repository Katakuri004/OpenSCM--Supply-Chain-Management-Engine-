ifeq ($(OS),Windows_NT)
PYTHON ?= .venv/Scripts/python.exe
else
PYTHON ?= .venv/bin/python
endif

.PHONY: check contracts
check:
	$(PYTHON) -m scm.check

contracts:
	$(PYTHON) -m scm.contracts

